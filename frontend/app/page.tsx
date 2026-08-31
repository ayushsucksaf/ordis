"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  api,
  createTerminalSocket,
  TerminalSession,
  RunResult,
} from "../frontend-lib-api";

type BottomTab = "none" | "output" | "terminal" | "ai";

export default function OrdisApp() {
  // Session
  const [sessionId, setSessionId] = useState<string>("");
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // Files & Editor
  const [filesDrawerOpen, setFilesDrawerOpen] = useState<boolean>(false);
  const [fileList, setFileList] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>("main.py");
  const [newFileName, setNewFileName] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>('# ordis mobile ide\nprint("hello world")\n');
  const [savedContent, setSavedContent] = useState<string>('# ordis mobile ide\nprint("hello world")\n');
  const [fileStatus, setFileStatus] = useState<string>("");
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);

  // Bottom dock
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>("none");
  const [bottomHeight, setBottomHeight] = useState<"normal" | "large">("normal");

  // Runner
  const [language, setLanguage] = useState<string>("python3");
  const [stdin, setStdin] = useState<string>("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // AI Agent
  const [agentPrompt, setAgentPrompt] = useState<string>("fix any bugs in main.py");
  const [agentReply, setAgentReply] = useState<string>("");
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);
  const [voiceStatus, setVoiceStatus] = useState<string>("");

  // Terminal
  const [terminalConnected, setTerminalConnected] = useState<boolean>(false);
  const [terminalLog, setTerminalLog] = useState<string>("");
  const [terminalCommand, setTerminalCommand] = useState<string>("");
  const terminalSocketRef = useRef<TerminalSession | null>(null);
  const terminalLogRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = fileContent !== savedContent;

  // Language auto-detect
  const detectLanguage = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "py") return "python3";
    if (ext === "cpp" || ext === "cc" || ext === "cxx" || ext === "c") return "cpp";
    if (ext === "js" || ext === "ts" || ext === "mjs") return "javascript";
    return "python3";
  };

  // Init
  useEffect(() => {
    async function init() {
      try {
        await api.health();
        setBackendOnline(true);
      } catch {
        setBackendOnline(false);
      }

      try {
        const session = await api.createSession();
        setSessionId(session.session_id);
        const initialCode = '# ordis mobile ide\nprint("hello world")\n';
        await api.writeFile(session.session_id, "main.py", initialCode);
        const files = await api.listFiles(session.session_id);
        setFileList(files.length ? files : ["main.py"]);
        setActiveFile("main.py");
        setFileContent(initialCode);
        setSavedContent(initialCode);
      } catch (err: any) {
        setFileStatus("Session init error: " + err.message);
      }
    }
    init();

    return () => {
      if (terminalSocketRef.current) {
        terminalSocketRef.current.close();
      }
    };
  }, []);

  // Scroll terminal
  useEffect(() => {
    if (terminalLogRef.current) {
      terminalLogRef.current.scrollTop = terminalLogRef.current.scrollHeight;
    }
  }, [terminalLog]);

  // Create new session
  const handleCreateSession = async () => {
    try {
      if (terminalSocketRef.current) {
        terminalSocketRef.current.close();
        setTerminalConnected(false);
      }
      const session = await api.createSession();
      setSessionId(session.session_id);
      const code = '# ordis mobile ide\nprint("hello world")\n';
      await api.writeFile(session.session_id, "main.py", code);
      setFileList(["main.py"]);
      setActiveFile("main.py");
      setFileContent(code);
      setSavedContent(code);
      setTerminalLog(`[session ${session.session_id.slice(0, 8)} started]\n`);
      setFileStatus("New session created");
      setFilesDrawerOpen(false);
    } catch (err: any) {
      setFileStatus("Error: " + err.message);
    }
  };

  // Refresh files
  const refreshFiles = async (sid = sessionId) => {
    if (!sid) return;
    try {
      const files = await api.listFiles(sid);
      setFileList(files);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Load file
  const handleLoadFile = async (path: string) => {
    if (!sessionId) return;
    setIsLoadingFile(true);
    setFileStatus(`Loading ${path}...`);
    try {
      const content = await api.readFile(sessionId, path);
      setActiveFile(path);
      setFileContent(content);
      setSavedContent(content);
      setLanguage(detectLanguage(path));
      setFileStatus(`Loaded ${path}`);
      setFilesDrawerOpen(false);
    } catch (err: any) {
      setFileStatus(`Error: ${err.message}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Save file
  const handleSaveFile = async () => {
    if (!sessionId || !activeFile.trim()) return;
    setFileStatus(`Saving ${activeFile}...`);
    try {
      await api.writeFile(sessionId, activeFile.trim(), fileContent);
      setSavedContent(fileContent);
      setFileStatus(`Saved ${activeFile}`);
      await refreshFiles();
    } catch (err: any) {
      setFileStatus(`Save error: ${err.message}`);
    }
  };

  // Create new file
  const handleCreateNewFile = async () => {
    if (!sessionId) return;
    const name = newFileName.trim();
    if (!name) return;
    try {
      const initial = name.endsWith(".cpp")
        ? '#include <iostream>\n\nint main() {\n    std::cout << "Hello C++" << std::endl;\n    return 0;\n}\n'
        : name.endsWith(".js")
        ? 'console.log("Hello JS");\n'
        : '# Python\nprint("Hello Python")\n';
      await api.writeFile(sessionId, name, initial);
      setNewFileName("");
      await refreshFiles();
      await handleLoadFile(name);
    } catch (err: any) {
      setFileStatus(`Error: ${err.message}`);
    }
  };

  // Run code
  const handleRunCode = async () => {
    if (!sessionId) return;
    setIsRunning(true);
    setActiveBottomTab("output");
    setRunResult(null);
    try {
      await api.writeFile(sessionId, activeFile, fileContent);
      setSavedContent(fileContent);
      setFileStatus(`Running ${activeFile}...`);
      const result = await api.runCode(sessionId, activeFile, language, stdin);
      setRunResult(result);
      setFileStatus(`Finished ${activeFile}`);
    } catch (err: any) {
      setRunResult({ error: err.message || "Execution failed" });
      setFileStatus("Execution error");
    } finally {
      setIsRunning(false);
    }
  };

  // AI Agent
  const handleSendToAgent = async (promptToSend?: string) => {
    if (!sessionId) return;
    const msg = promptToSend || agentPrompt;
    if (!msg.trim()) return;
    setIsAgentThinking(true);
    setActiveBottomTab("ai");
    setAgentReply("Agent is processing and editing files...");
    try {
      const res = await api.agentChat(sessionId, msg);
      setAgentReply(res.reply || res.error || "No response");
      await refreshFiles();
      if (activeFile) {
        const updated = await api.readFile(sessionId, activeFile);
        setFileContent(updated);
        setSavedContent(updated);
      }
    } catch (err: any) {
      setAgentReply("Agent error: " + err.message);
    } finally {
      setIsAgentThinking(false);
    }
  };

  // Voice
  const handleVoiceTranscribe = async () => {
    setVoiceStatus("Listening via Termux microphone...");
    try {
      const res = await api.transcribeVoice();
      if (res.error) {
        setVoiceStatus("Mic info: " + res.error);
      } else if (res.text) {
        setAgentPrompt(res.text);
        setVoiceStatus(`Recognized: "${res.text}"`);
      } else {
        setVoiceStatus("No speech detected");
      }
    } catch (err: any) {
      setVoiceStatus("Voice error: " + err.message);
    }
  };

  // Terminal
  const handleToggleTerminal = () => {
    if (!sessionId) return;
    if (terminalConnected && terminalSocketRef.current) {
      terminalSocketRef.current.close();
      setTerminalConnected(false);
      setTerminalLog((prev) => prev + "\n[terminal disconnected]\n");
      return;
    }

    setTerminalLog((prev) => prev + `[connecting to bash shell...]\n`);
    const sock = createTerminalSocket(
      sessionId,
      (data) => {
        setTerminalLog((prev) => prev + data);
      },
      (status) => {
        if (status === "connected") {
          setTerminalConnected(true);
          setTerminalLog((prev) => prev + "[connected to bash]\n");
        } else if (status === "disconnected") {
          setTerminalConnected(false);
          setTerminalLog((prev) => prev + "\n[terminal disconnected]\n");
        } else if (status === "error") {
          setTerminalConnected(false);
          setTerminalLog((prev) => prev + "\n[terminal error]\n");
        }
      }
    );
    terminalSocketRef.current = sock;
  };

  const handleSendTerminal = (cmdToSend?: string) => {
    const cmd = cmdToSend !== undefined ? cmdToSend : terminalCommand;
    if (!terminalSocketRef.current || !terminalConnected) {
      handleToggleTerminal();
      return;
    }
    terminalSocketRef.current.send(cmd + "\n");
    if (cmdToSend === undefined) {
      setTerminalCommand("");
    }
  };

  const handleSendCtrlC = () => {
    if (terminalSocketRef.current && terminalConnected) {
      terminalSocketRef.current.send("\x03");
    }
  };

  // Helper keyboard keys for mobile
  const insertKey = (char: string) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = fileContent;
    const newText = text.substring(0, start) + char + text.substring(end);
    setFileContent(newText);
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + char.length;
      el.focus();
    }, 0);
  };

  // Line count for editor gutter
  const lineCount = Math.max(fileContent.split("\n").length, 1);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div style={{
      height: "100dvh",
      width: "100vw",
      display: "flex",
      flexDirection: "column",
      background: "#0d0d0d",
      color: "#e6e6e6",
      fontFamily: "monospace",
      overflow: "hidden",
      userSelect: "none",
    }}>
      {/* ─── TOP BAR ─────────────────────────────────────────────── */}
      <header style={{
        height: "44px",
        background: "#141414",
        borderBottom: "1px solid #262626",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        flexShrink: 0,
      }}>
        {/* Left: Files Toggle & Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setFilesDrawerOpen(!filesDrawerOpen)}
            style={{
              background: filesDrawerOpen ? "#333" : "#202020",
              color: "#fff",
              border: "1px solid #3a3a3a",
              padding: "4px 8px",
              fontFamily: "monospace",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            [FILES]
          </button>
          <span style={{ fontWeight: "bold", letterSpacing: "1px", fontSize: "13px" }}>ORDIS</span>
        </div>

        {/* Center: Filename & Status */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "35%",
          fontSize: "12px",
          color: "#aaa",
        }}>
          <span>{activeFile}</span>
          {isDirty && <span style={{ color: "#fff", fontWeight: "bold" }}>*</span>}
        </div>

        {/* Right: Save & Run */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={handleSaveFile}
            style={{
              background: isDirty ? "#fff" : "#222",
              color: isDirty ? "#000" : "#888",
              border: "1px solid #444",
              padding: "4px 8px",
              fontFamily: "monospace",
              fontSize: "12px",
              fontWeight: isDirty ? "bold" : "normal",
              cursor: "pointer",
            }}
          >
            [SAVE]
          </button>
          <button
            onClick={handleRunCode}
            disabled={isRunning}
            style={{
              background: "#2a2a2a",
              color: "#fff",
              border: "1px solid #555",
              padding: "4px 10px",
              fontFamily: "monospace",
              fontSize: "12px",
              fontWeight: "bold",
              cursor: isRunning ? "wait" : "pointer",
            }}
          >
            {isRunning ? "[RUNNING...]" : "[RUN]"}
          </button>
        </div>
      </header>

      {/* ─── MAIN WORKSPACE (FILES DRAWER + CODE EDITOR) ─────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Slide-out Files Drawer */}
        {filesDrawerOpen && (
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: "260px",
            background: "#121212",
            borderRight: "1px solid #282828",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            boxShadow: "4px 0 16px rgba(0,0,0,0.6)",
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: "8px",
              borderBottom: "1px solid #222",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontSize: "11px", fontWeight: "bold", letterSpacing: "1px", color: "#888" }}>
                WORKSPACE FILES
              </span>
              <button
                onClick={() => setFilesDrawerOpen(false)}
                style={{
                  background: "transparent",
                  color: "#aaa",
                  border: "none",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  cursor: "pointer",
                  padding: "2px 6px",
                }}
              >
                [X]
              </button>
            </div>

            {/* Session Actions */}
            <div style={{ padding: "8px", borderBottom: "1px solid #222", fontSize: "11px" }}>
              <div style={{ color: "#777", marginBottom: "4px" }}>
                SESSION: {sessionId ? sessionId.slice(0, 8) : "none"}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  onClick={handleCreateSession}
                  style={{
                    flex: 1,
                    background: "#1e1e1e",
                    color: "#ccc",
                    border: "1px solid #333",
                    padding: "4px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  + NEW SESSION
                </button>
                <button
                  onClick={() => refreshFiles()}
                  style={{
                    background: "#1e1e1e",
                    color: "#ccc",
                    border: "1px solid #333",
                    padding: "4px 8px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  REFRESH
                </button>
              </div>
            </div>

            {/* New File Input */}
            <div style={{ padding: "8px", borderBottom: "1px solid #222", display: "flex", gap: "4px" }}>
              <input
                type="text"
                placeholder="new_file.py"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateNewFile();
                }}
                style={{
                  flex: 1,
                  background: "#080808",
                  color: "#fff",
                  border: "1px solid #333",
                  padding: "4px 6px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                }}
              />
              <button
                onClick={handleCreateNewFile}
                style={{
                  background: "#222",
                  color: "#fff",
                  border: "1px solid #444",
                  padding: "4px 8px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                +
              </button>
            </div>

            {/* File List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {fileList.map((f) => {
                const isSelected = f === activeFile;
                return (
                  <div
                    key={f}
                    onClick={() => handleLoadFile(f)}
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      cursor: "pointer",
                      background: isSelected ? "#242424" : "transparent",
                      color: isSelected ? "#ffffff" : "#aaaaaa",
                      borderLeft: isSelected ? "2px solid #ffffff" : "2px solid transparent",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{f}</span>
                    {f === activeFile && isDirty && <span style={{ color: "#888" }}>*</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Code Editor Container */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#0a0a0a",
          overflow: "hidden",
        }}>
          {/* Editor Body: Line numbers + Textarea */}
          <div style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            position: "relative",
          }}>
            {/* Line Numbers Gutter */}
            <div style={{
              width: "36px",
              background: "#0d0d0d",
              borderRight: "1px solid #1f1f1f",
              color: "#444444",
              fontSize: "13px",
              lineHeight: "20px",
              textAlign: "right",
              padding: "8px 6px 8px 0",
              boxSizing: "border-box",
              overflow: "hidden",
              userSelect: "none",
            }}>
              {lineNumbers.map((n) => (
                <div key={n} style={{ height: "20px" }}>{n}</div>
              ))}
            </div>

            {/* Code Textarea */}
            <textarea
              ref={textareaRef}
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                background: "transparent",
                color: "#f0f0f0",
                border: "none",
                outline: "none",
                resize: "none",
                fontFamily: "'JetBrains Mono', Consolas, Monaco, monospace",
                fontSize: "13px",
                lineHeight: "20px",
                padding: "8px",
                boxSizing: "border-box",
                tabSize: 4,
                whiteSpace: "pre",
                overflowY: "auto",
                overflowX: "auto",
              }}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  insertKey("    ");
                }
              }}
            />
          </div>

          {/* Mobile Keyboard Assist Toolbar */}
          <div style={{
            height: "30px",
            background: "#111111",
            borderTop: "1px solid #222222",
            display: "flex",
            alignItems: "center",
            overflowX: "auto",
            padding: "0 4px",
            gap: "2px",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}>
            {["Tab", "{", "}", "(", ")", "[", "]", ";", ":", '"', "'", "=", "+", "-", "_", ".", "/", "\\"].map((key) => (
              <button
                key={key}
                onClick={() => insertKey(key === "Tab" ? "    " : key)}
                style={{
                  background: "#1c1c1c",
                  color: "#bbb",
                  border: "1px solid #2e2e2e",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                  cursor: "pointer",
                  minWidth: "24px",
                }}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── BOTTOM DOCK (COLLAPSIBLE PANELS) ────────────────────── */}
      {activeBottomTab !== "none" && (
        <div style={{
          height: bottomHeight === "large" ? "65dvh" : "38dvh",
          background: "#121212",
          borderTop: "1px solid #2a2a2a",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 40,
        }}>
          {/* Panel Sub-Header */}
          <div style={{
            height: "30px",
            background: "#171717",
            borderBottom: "1px solid #222",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 8px",
            fontSize: "11px",
          }}>
            <span style={{ fontWeight: "bold", color: "#888", letterSpacing: "0.5px" }}>
              {activeBottomTab === "output" && "CODE EXECUTION OUTPUT"}
              {activeBottomTab === "terminal" && "BASH SHELL (PTY)"}
              {activeBottomTab === "ai" && "AI AGENT ASSISTANT"}
            </span>

            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setBottomHeight(bottomHeight === "large" ? "normal" : "large")}
                style={{
                  background: "transparent",
                  color: "#888",
                  border: "none",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                [{bottomHeight === "large" ? "RESTORE" : "EXPAND"}]
              </button>
              <button
                onClick={() => setActiveBottomTab("none")}
                style={{
                  background: "transparent",
                  color: "#aaa",
                  border: "none",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                [HIDE]
              </button>
            </div>
          </div>

          {/* Panel Content: OUTPUT */}
          {activeBottomTab === "output" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px", overflow: "hidden" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", color: "#888" }}>LANG:</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    background: "#080808",
                    color: "#fff",
                    border: "1px solid #333",
                    padding: "3px 6px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                  }}
                >
                  <option value="python3">python3</option>
                  <option value="cpp">cpp (clang++)</option>
                  <option value="javascript">javascript (node)</option>
                </select>
                <input
                  type="text"
                  placeholder="stdin (optional)..."
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: "120px",
                    background: "#080808",
                    color: "#fff",
                    border: "1px solid #333",
                    padding: "3px 6px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                  }}
                />
                <button
                  onClick={handleRunCode}
                  disabled={isRunning}
                  style={{
                    background: "#fff",
                    color: "#000",
                    border: "none",
                    padding: "3px 8px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  {isRunning ? "RUNNING..." : "RUN"}
                </button>
              </div>

              <pre style={{
                flex: 1,
                margin: 0,
                background: "#050505",
                color: "#e0e0e0",
                border: "1px solid #222",
                padding: "8px",
                fontSize: "12px",
                lineHeight: "18px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}>
                {runResult
                  ? JSON.stringify(runResult, null, 2)
                  : "(Click [RUN] to execute code)"}
              </pre>
            </div>
          )}

          {/* Panel Content: TERMINAL */}
          {activeBottomTab === "terminal" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px", overflow: "hidden" }}>
              {/* Quick actions */}
              <div style={{ display: "flex", gap: "4px", marginBottom: "6px", overflowX: "auto", whiteSpace: "nowrap" }}>
                <button
                  onClick={handleToggleTerminal}
                  style={{
                    background: terminalConnected ? "#333" : "#222",
                    color: terminalConnected ? "#fff" : "#888",
                    border: "1px solid #444",
                    padding: "2px 6px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                    cursor: "pointer",
                  }}
                >
                  {terminalConnected ? "[DISCONNECT]" : "[CONNECT]"}
                </button>
                {["ls -la", "pwd", "git status", `python3 ${activeFile}`, "clear"].map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => handleSendTerminal(cmd)}
                    style={{
                      background: "#1a1a1a",
                      color: "#aaa",
                      border: "1px solid #2e2e2e",
                      padding: "2px 6px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                  >
                    {cmd}
                  </button>
                ))}
                <button
                  onClick={handleSendCtrlC}
                  style={{
                    background: "#2a1515",
                    color: "#ff8888",
                    border: "1px solid #4a2020",
                    padding: "2px 6px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Ctrl+C
                </button>
              </div>

              {/* Terminal Log */}
              <pre
                ref={terminalLogRef}
                style={{
                  flex: 1,
                  margin: "0 0 6px 0",
                  background: "#000000",
                  color: "#d0d0d0",
                  border: "1px solid #222222",
                  padding: "8px",
                  fontSize: "11px",
                  lineHeight: "16px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {terminalLog || "[terminal ready - click connect or type command below]\n"}
              </pre>

              {/* Command Input */}
              <div style={{ display: "flex", gap: "4px" }}>
                <input
                  type="text"
                  placeholder="type bash command..."
                  value={terminalCommand}
                  onChange={(e) => setTerminalCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendTerminal();
                  }}
                  style={{
                    flex: 1,
                    background: "#080808",
                    color: "#fff",
                    border: "1px solid #333",
                    padding: "4px 8px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                  }}
                />
                <button
                  onClick={() => handleSendTerminal()}
                  style={{
                    background: "#fff",
                    color: "#000",
                    border: "none",
                    padding: "4px 10px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  SEND
                </button>
              </div>
            </div>
          )}

          {/* Panel Content: AI AGENT */}
          {activeBottomTab === "ai" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px", overflow: "hidden" }}>
              {/* Quick suggestions */}
              <div style={{ display: "flex", gap: "4px", marginBottom: "6px", overflowX: "auto", whiteSpace: "nowrap" }}>
                {[
                  `fix bugs in ${activeFile}`,
                  `add comments to ${activeFile}`,
                  `write unit test for ${activeFile}`,
                ].map((sug) => (
                  <button
                    key={sug}
                    onClick={() => handleSendToAgent(sug)}
                    style={{
                      background: "#1a1a1a",
                      color: "#aaa",
                      border: "1px solid #333",
                      padding: "2px 6px",
                      fontSize: "10px",
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                  >
                    {sug}
                  </button>
                ))}
              </div>

              {/* Prompt Input */}
              <div style={{ display: "flex", gap: "4px", marginBottom: "6px" }}>
                <input
                  type="text"
                  placeholder="Ask agent to write, refactor or fix code..."
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendToAgent();
                  }}
                  style={{
                    flex: 1,
                    background: "#080808",
                    color: "#fff",
                    border: "1px solid #333",
                    padding: "4px 8px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                  }}
                />
                <button
                  onClick={handleVoiceTranscribe}
                  style={{
                    background: "#222",
                    color: "#fff",
                    border: "1px solid #444",
                    padding: "4px 8px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  MIC
                </button>
                <button
                  onClick={() => handleSendToAgent()}
                  disabled={isAgentThinking}
                  style={{
                    background: "#fff",
                    color: "#000",
                    border: "none",
                    padding: "4px 10px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    fontWeight: "bold",
                    cursor: isAgentThinking ? "wait" : "pointer",
                  }}
                >
                  {isAgentThinking ? "..." : "ASK"}
                </button>
              </div>

              {voiceStatus && (
                <div style={{ fontSize: "10px", color: "#888", marginBottom: "4px" }}>
                  {voiceStatus}
                </div>
              )}

              {/* Agent Response */}
              <pre style={{
                flex: 1,
                margin: 0,
                background: "#050505",
                color: "#e0e0e0",
                border: "1px solid #222",
                padding: "8px",
                fontSize: "11px",
                lineHeight: "16px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {agentReply || "(Agent responses and file edit summaries will appear here)"}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ─── BOTTOM DOCK BAR ─────────────────────────────────────── */}
      <footer style={{
        height: "36px",
        background: "#141414",
        borderTop: "1px solid #262626",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 6px",
        flexShrink: 0,
      }}>
        {/* Dock Tabs */}
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => setActiveBottomTab(activeBottomTab === "output" ? "none" : "output")}
            style={{
              background: activeBottomTab === "output" ? "#333" : "transparent",
              color: activeBottomTab === "output" ? "#fff" : "#888",
              border: activeBottomTab === "output" ? "1px solid #555" : "1px solid transparent",
              padding: "4px 8px",
              fontFamily: "monospace",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            [OUTPUT]
          </button>
          <button
            onClick={() => {
              if (activeBottomTab === "terminal") {
                setActiveBottomTab("none");
              } else {
                setActiveBottomTab("terminal");
                if (!terminalConnected) handleToggleTerminal();
              }
            }}
            style={{
              background: activeBottomTab === "terminal" ? "#333" : "transparent",
              color: activeBottomTab === "terminal" ? "#fff" : "#888",
              border: activeBottomTab === "terminal" ? "1px solid #555" : "1px solid transparent",
              padding: "4px 8px",
              fontFamily: "monospace",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            [TERMINAL]
          </button>
          <button
            onClick={() => setActiveBottomTab(activeBottomTab === "ai" ? "none" : "ai")}
            style={{
              background: activeBottomTab === "ai" ? "#333" : "transparent",
              color: activeBottomTab === "ai" ? "#fff" : "#888",
              border: activeBottomTab === "ai" ? "1px solid #555" : "1px solid transparent",
              padding: "4px 8px",
              fontFamily: "monospace",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            [AI AGENT]
          </button>
        </div>

        {/* Status indicator */}
        <div style={{ fontSize: "10px", color: "#666" }}>
          {fileStatus || (backendOnline ? "ONLINE (8000)" : "OFFLINE")}
        </div>
      </footer>
    </div>
  );
}