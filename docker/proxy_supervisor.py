"""Run Squid and the API together in a single-instance free-tier container."""

from __future__ import annotations

import asyncio
import os
import signal
import sys


async def wait_for_proxy(process: asyncio.subprocess.Process) -> None:
    for _ in range(80):
        if process.returncode is not None:
            raise RuntimeError(f"Squid exited during startup with status {process.returncode}")
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection("127.0.0.1", 3128), timeout=0.25
            )
            writer.close()
            await writer.wait_closed()
            return
        except (OSError, TimeoutError):
            await asyncio.sleep(0.125)
    raise RuntimeError("Squid did not start listening on loopback")


async def stop(process: asyncio.subprocess.Process) -> None:
    if process.returncode is None:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except TimeoutError:
            process.kill()
            await process.wait()


async def main() -> int:
    port = os.environ.get("PORT", "8000")
    if not port.isdecimal() or not 1 <= int(port) <= 65535:
        raise RuntimeError("PORT must be a valid TCP port")
    squid = await asyncio.create_subprocess_exec(
        "squid", "-N", "-f", "/etc/squid/squid.conf"
    )
    api: asyncio.subprocess.Process | None = None
    try:
        await wait_for_proxy(squid)
        api = await asyncio.create_subprocess_exec(
            "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port,
            "--no-access-log",
        )
        loop = asyncio.get_running_loop()
        stopping = asyncio.Event()
        for signum in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(signum, stopping.set)
        api_exit = asyncio.create_task(api.wait())
        squid_exit = asyncio.create_task(squid.wait())
        stop_signal = asyncio.create_task(stopping.wait())
        done, pending = await asyncio.wait(
            {api_exit, squid_exit, stop_signal}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        if stop_signal in done:
            await asyncio.gather(stop(api), stop(squid))
            return 0
        failed = api if api_exit in done else squid
        survivor = squid if failed is api else api
        exit_code = failed.returncode if failed.returncode is not None else 1
        await stop(survivor)
        return exit_code or 1
    finally:
        if api is not None:
            await stop(api)
        await stop(squid)


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        raise SystemExit(130)
