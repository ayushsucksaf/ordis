import subprocess
import tempfile
import os
CXX_COMPILER = os.getenv("CXX_COMPILER", "g++")
TIMEOUT_SECONDS = 10

#exec python
async def run_python(code: str, stdin: str = "") -> dict:
    #write the code into the file
    with tempfile.NamedTemporaryFile(suffix=".py", delete=False, mode="w") as f:
        f.write(code)
        path = f.name
    try:
        result = subprocess.run(
            ["python3", path],
            input=stdin, capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        )
        return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.returncode}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out.", "exit_code": -1}
    finally:
        os.unlink(path)

#exec js
async def run_javascript(code: str, stdin: str = "") -> dict:
    with tempfile.NamedTemporaryFile(suffix=".js", delete=False, mode="w") as f:
        f.write(code)
        path = f.name
    try:
        result = subprocess.run(
            ["node", path],
            input=stdin, capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        )
        return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.returncode}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out.", "exit_code": -1}
    finally:
        os.unlink(path)

#exec cpp
async def run_cpp(code: str, stdin: str = "") -> dict:
    workdir = tempfile.mkdtemp()
    src = os.path.join(workdir, "main.cpp")
    binary = os.path.join(workdir, "a.out")
    with open(src, "w") as f:
        f.write(code)

    compiled = subprocess.run(
        [CXX_COMPILER, src, "-o", binary],
        capture_output=True, text=True, timeout=15,
    )
    if compiled.returncode != 0:
        return {
            "stdout": "", "stderr": compiled.stderr,
            "compile_output": compiled.stderr, "exit_code": compiled.returncode,
        }

    try:
        result = subprocess.run(
            [binary], input=stdin, capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        )
        return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.returncode}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out.", "exit_code": -1}