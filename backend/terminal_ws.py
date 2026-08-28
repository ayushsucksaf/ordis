import asyncio
import os
import pty
import signal
from fastapi import WebSocket, WebSocketDisconnect

async def pty_terminal(websocket: WebSocket):
    await websocket.accept()
    pid, fd = pty.fork()

    if pid == 0:
        # child process becomes the shell
        os.execvp("bash", ["bash"])
        return

    loop = asyncio.get_event_loop()

    def read_and_forward():
        try:
            data = os.read(fd, 1024)
            asyncio.create_task(websocket.send_bytes(data))
        except OSError:
            pass

    loop.add_reader(fd, read_and_forward)

    try:
        while True:
            data = await websocket.receive_bytes()
            os.write(fd, data)
    except WebSocketDisconnect:
        pass
    finally:
        loop.remove_reader(fd)
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

async def pty_terminal(websocket: WebSocket, session_dir: str):
    await websocket.accept()
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(session_dir)
        os.execvp("bash", ["bash"])
        return

    loop = asyncio.get_event_loop()

    def read_and_forward():
        try:
            data = os.read(fd, 1024)
            asyncio.create_task(websocket.send_text(data.decode(errors="replace")))
        except OSError:
            pass

    loop.add_reader(fd, read_and_forward)

    try:
        while True:
            data = await websocket.receive_text()   # was receive_bytes
            os.write(fd, data.encode())              # was raw bytes
    except WebSocketDisconnect:
        pass
    finally:
        loop.remove_reader(fd)
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass