"""Start the bundled Squid proxy and verify internal destinations are denied."""

from __future__ import annotations

import asyncio
import subprocess
from urllib.parse import urlsplit

import httpx


async def main() -> None:
    proxy = subprocess.Popen(["squid", "-N", "-f", "/etc/squid/squid.conf"])
    try:
        for _ in range(80):
            if proxy.poll() is not None:
                raise RuntimeError(f"Squid exited during verification with {proxy.returncode}")
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection("127.0.0.1", 3128), timeout=0.25
                )
                writer.close()
                await writer.wait_closed()
                break
            except (OSError, TimeoutError):
                await asyncio.sleep(0.125)
        else:
            raise RuntimeError("Squid did not start")

        urls = (
            "http://0.0.0.0/",
            "http://0.0.0.1/",
            "http://127.0.0.1/",
            "http://[::ffff:0.0.0.1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:10.0.0.1]/",
            "https://169.254.169.254/latest/meta-data/",
            "http://rebind-test.example/",
        )
        for url in urls:
            target = urlsplit(url)
            method = "CONNECT" if target.scheme == "https" else "GET"
            authority = target.netloc
            request_target = authority if method == "CONNECT" else url
            request = (
                f"{method} {request_target} HTTP/1.1\r\n"
                f"Host: {authority}\r\nConnection: close\r\n\r\n"
            )
            reader, writer = await asyncio.open_connection("127.0.0.1", 3128)
            writer.write(request.encode("ascii"))
            await writer.drain()
            status_line = await asyncio.wait_for(reader.readline(), timeout=4)
            writer.close()
            await writer.wait_closed()
            if not status_line.startswith(b"HTTP/1.1 403"):
                raise RuntimeError(
                    f"Expected Squid to deny {url}, received {status_line.decode(errors='replace').strip()}"
                )
            print(f"blocked: {url}")
    finally:
        proxy.terminate()
        try:
            await asyncio.to_thread(proxy.wait, 5)
        except subprocess.TimeoutExpired:
            proxy.kill()
            await asyncio.to_thread(proxy.wait)


if __name__ == "__main__":
    asyncio.run(main())
