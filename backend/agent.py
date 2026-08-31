import os

def make_tools(session_dir: str):
    def _safe_path(path: str) -> str:
        full = os.path.abspath(os.path.join(session_dir, path))
        if not full.startswith(os.path.abspath(session_dir)):
            raise ValueError("Path escapes the project directory")
        return full

    def read_file(path: str) -> str:
        """Read the contents of a file in the project.

        Args:
            path: Relative path to the file, e.g. 'main.py' or 'src/utils.py'.
        """
        with open(_safe_path(path), "r") as f:
            return f.read()

    def write_file(path: str, content: str) -> str:
        """Create a new file or overwrite an existing one with new content.

        Args:
            path: Relative path to the file, e.g. 'main.py'.
            content: The full new content of the file.
        """
        full = _safe_path(path)
        os.makedirs(os.path.dirname(full) or session_dir, exist_ok=True)
        with open(full, "w") as f:
            f.write(content)
        return f"Wrote {len(content)} characters to {path}"

    def list_files() -> list[str]:
        """List every file currently in the project."""
        out = []
        for root, dirs, files in os.walk(session_dir):
            if ".git" in dirs:
                dirs.remove(".git")
            for f in files:
                out.append(os.path.relpath(os.path.join(root, f), session_dir))
        return out

    return [read_file, write_file, list_files]