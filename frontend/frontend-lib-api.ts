// Ordis Frontend API Client

const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
    }
    const protocol = window.location.protocol;
    const hostname = window.location.hostname || "localhost";
    return `${protocol}//${hostname}:8000`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
};

export const getApiBase = () => getBaseUrl();
export const getWsBase = () => getBaseUrl().replace(/^http/, "ws");

export interface RunResult {
  stdout?: string;
  stderr?: string;
  compile_output?: string;
  exit_code?: number;
  error?: string;
}

export interface VoiceResult {
  text?: string;
  error?: string;
}

export interface AgentResult {
  reply?: string;
  error?: string;
}

export function cleanAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\x1b\].*?(\x07|\x1b\\)/g, "")
    .replace(/\x1b[PX^_].*?\x1b\\/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F]/g, "");
}

export const api = {
  health: async (): Promise<{ status: string }> => {
    const res = await fetch(`${getApiBase()}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  },

  createSession: async (): Promise<{ session_id: string }> => {
    const res = await fetch(`${getApiBase()}/session/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
    return res.json();
  },

  listFiles: async (sessionId: string): Promise<string[]> => {
    const res = await fetch(
      `${getApiBase()}/files/list?session_id=${encodeURIComponent(sessionId)}`
    );
    if (!res.ok) throw new Error(`Failed to list files: ${res.status}`);
    const data = await res.json();
    return data.files || [];
  },

  readFile: async (sessionId: string, path: string): Promise<string> => {
    const res = await fetch(
      `${getApiBase()}/files/read?session_id=${encodeURIComponent(
        sessionId
      )}&path=${encodeURIComponent(path)}`
    );
    if (!res.ok) throw new Error(`Failed to read file: ${res.status}`);
    const data = await res.json();
    return data.content ?? "";
  },

  writeFile: async (
    sessionId: string,
    path: string,
    content: string
  ): Promise<{ ok: boolean }> => {
    const res = await fetch(`${getApiBase()}/files/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        path,
        content,
      }),
    });
    if (!res.ok) throw new Error(`Failed to write file: ${res.status}`);
    return res.json();
  },

  runCode: async (
    sessionId: string,
    filename: string,
    language: string,
    stdin: string = ""
  ): Promise<RunResult> => {
    const res = await fetch(`${getApiBase()}/code/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        filename,
        language,
        stdin,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "Run failed");
      return { error: `Server error (${res.status}): ${text}` };
    }
    return res.json();
  },

  agentChat: async (sessionId: string, message: string): Promise<AgentResult> => {
    const res = await fetch(`${getApiBase()}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "Agent failed");
      return { error: `Agent server error (${res.status}): ${text}` };
    }
    return res.json();
  },

  transcribeVoice: async (): Promise<VoiceResult> => {
    const res = await fetch(`${getApiBase()}/voice/transcribe`, {
      method: "POST",
    });
    if (!res.ok) {
      return { error: `Voice server error (${res.status})` };
    }
    return res.json();
  },
};

export interface TerminalSession {
  send: (text: string) => void;
  close: () => void;
}

export function createTerminalSocket(
  sessionId: string,
  onData: (text: string) => void,
  onStatus?: (status: "connected" | "disconnected" | "error") => void
): TerminalSession {
  const wsUrl = `${getWsBase()}/terminal?session_id=${encodeURIComponent(sessionId)}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    onStatus?.("connected");
  };

  ws.onmessage = (event) => {
    const cleaned = cleanAnsi(event.data);
    onData(cleaned);
  };

  ws.onerror = () => {
    onStatus?.("error");
  };

  ws.onclose = () => {
    onStatus?.("disconnected");
  };

  return {
    send: (text: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(text);
      }
    },
    close: () => {
      ws.close();
    },
  };
}