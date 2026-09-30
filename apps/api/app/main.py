"""NexusAI API: durable conversations and a Gemini-backed SSE chat stream."""

from __future__ import annotations

import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import DateTime, ForeignKey, String, Text, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

log = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./nexusai.db"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    cors_origins: str = "http://localhost:3000"


settings = Settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    messages: Mapped[list[Message]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    conversation: Mapped[Conversation] = relationship(back_populates="messages")


def get_db():
    with SessionLocal() as db:
        yield db


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="NexusAI API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


def utc(value: datetime) -> str:
    return value.replace(tzinfo=value.tzinfo or timezone.utc).isoformat()


def conversation_json(conversation: Conversation, db: Session) -> dict:
    count = db.scalar(select(func.count(Message.id)).where(Message.conversation_id == conversation.id)) or 0
    latest = db.scalar(select(Message.content).where(Message.conversation_id == conversation.id).order_by(Message.created_at.desc()).limit(1))
    return {
        "id": conversation.id,
        "title": conversation.title,
        "createdAt": utc(conversation.created_at),
        "updatedAt": utc(conversation.updated_at),
        "messageCount": count,
        "lastMessagePreview": latest[:80] if latest else None,
        "activeAgentId": "agent_supervisor",
    }


def message_json(message: Message) -> dict:
    return {
        "id": message.id,
        "conversationId": message.conversation_id,
        "role": message.role,
        "content": message.content,
        "createdAt": utc(message.created_at),
        "agentName": "Nexus Supervisor" if message.role == "assistant" else None,
    }


class CreateConversation(BaseModel):
    title: str = Field(default="New Agent Session", max_length=200)


class StreamRequest(BaseModel):
    conversationId: str
    message: str = Field(min_length=1, max_length=20000)


@app.get("/health")
def health():
    return {"status": "ok", "geminiConfigured": bool(settings.gemini_api_key)}


@app.get("/api/v1/conversations")
def list_conversations(db: Session = Depends(get_db)):
    rows = db.scalars(select(Conversation).order_by(Conversation.updated_at.desc()).limit(100)).all()
    return [conversation_json(row, db) for row in rows]


@app.post("/api/v1/conversations", status_code=201)
def create_conversation(payload: CreateConversation, db: Session = Depends(get_db)):
    row = Conversation(id=f"conv_{uuid4().hex}", title=payload.title)
    db.add(row)
    db.commit()
    db.refresh(row)
    return conversation_json(row, db)


@app.get("/api/v1/conversations/{conversation_id}/messages")
def list_messages(conversation_id: str, db: Session = Depends(get_db)):
    if db.get(Conversation, conversation_id) is None:
        raise HTTPException(404, "Conversation not found")
    rows = db.scalars(select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at, Message.id)).all()
    return [message_json(row) for row in rows]


@app.delete("/api/v1/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):
    row = db.get(Conversation, conversation_id)
    if row is None:
        raise HTTPException(404, "Conversation not found")
    db.delete(row)
    db.commit()
    return {"success": True}


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/v1/agent/stream")
async def stream_agent(payload: StreamRequest, db: Session = Depends(get_db)):
    conversation = db.get(Conversation, payload.conversationId)
    if conversation is None:
        raise HTTPException(404, "Conversation not found")
    if not settings.gemini_api_key:
        raise HTTPException(503, "GEMINI_API_KEY is not configured")

    history = db.scalars(
        select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at, Message.id)
    ).all()
    user_message = Message(id=f"msg_{uuid4().hex}", conversation_id=conversation.id, role="user", content=payload.message)
    db.add(user_message)
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()

    contents = [
        {"role": "model" if item.role == "assistant" else "user", "parts": [{"text": item.content}]}
        for item in history[-20:]
        if item.role in {"user", "assistant"} and item.content
    ]
    contents.append({"role": "user", "parts": [{"text": payload.message}]})
    run_id = f"run_{uuid4().hex}"
    assistant_id = f"msg_{uuid4().hex}"

    async def events():
        started = time.monotonic()
        answer = ""
        yield sse("run:init", {"runId": run_id, "agentName": "Nexus Supervisor", "status": "running"})
        yield sse("step:start", {"stepId": "gemini", "name": "Gemini response", "agentName": "Nexus Supervisor", "summary": "Generating an answer from this conversation"})
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:streamGenerateContent?alt=sse"
        request = {
            "systemInstruction": {"parts": [{"text": "You are NexusAI, a helpful personal chief of staff. Be direct and accurate. You currently have no connected tools. Never claim to have read email, checked a calendar, browsed the web, sent a message, or scheduled work. If asked to do so, explain that the integration is not connected yet."}]},
            "contents": contents,
        }
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=15)) as client:
                async with client.stream("POST", url, headers={"x-goog-api-key": settings.gemini_api_key}, json=request) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        try:
                            chunk = json.loads(line[6:])
                        except json.JSONDecodeError:
                            continue
                        for candidate in chunk.get("candidates", []):
                            for part in candidate.get("content", {}).get("parts", []):
                                if part.get("thought"):
                                    continue
                                delta = part.get("text", "")
                                if delta:
                                    answer += delta
                                    yield sse("stream:chunk", {"delta": delta, "messageId": assistant_id})
            if not answer:
                raise ValueError("Gemini returned no text")
            with SessionLocal() as write_db:
                write_db.add(Message(id=assistant_id, conversation_id=conversation.id, role="assistant", content=answer))
                saved_conversation = write_db.get(Conversation, conversation.id)
                saved_conversation.updated_at = datetime.now(timezone.utc)
                write_db.commit()
            yield sse("step:complete", {"stepId": "gemini", "summary": "Answer generated", "durationMs": int((time.monotonic() - started) * 1000)})
            yield sse("run:complete", {"runId": run_id, "status": "completed", "durationMs": int((time.monotonic() - started) * 1000)})
        except (httpx.HTTPError, ValueError) as exc:
            log.exception("Gemini stream failed")
            yield sse("run:error", {"runId": run_id, "error": "Gemini request failed. Check the API key, model, and service availability."})

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
