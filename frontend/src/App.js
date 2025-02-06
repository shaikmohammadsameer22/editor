import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import io from "socket.io-client";
import "./App.css"; // Import CSS for cursor styling

// Connect to the socket server
const socket = io("http://localhost:5000");

function App() {
  const [code, setCode] = useState("");
  const [roomId] = useState("room-1");
  const [remoteCursors, setRemoteCursors] = useState({});
  const [username, setUsername] = useState("");
  const [enteredUsername, setEnteredUsername] = useState(""); // Username input before joining
  const [userColors, setUserColors] = useState({});
  const [joined, setJoined] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [language, setLanguage] = useState("javascript"); // Default to JavaScript
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const contentWidgets = useRef({});
  const typingTimers = useRef({});

  useEffect(() => {
    if (!joined) return;

    socket.emit("join-room", { roomId, username });

    const handleCodeUpdate = (newCode) => setCode(newCode);
    const handleCursorUpdate = ({ userId, cursorPosition, username: remoteUsername }) => {
      if (userId === username) return;
      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: { cursorPosition, username: remoteUsername },
      }));
      setUserColors((prevColors) => {
        if (!prevColors[userId]) return { ...prevColors, [userId]: generateColor(userId) };
        return prevColors;
      });
    };

    const handleTypingUpdate = ({ userId, username: remoteUsername, isTyping }) => {
      if (userId === username) return;
      setTypingUsers((prev) => {
        if (isTyping) return { ...prev, [userId]: remoteUsername };
        else {
          const newTyping = { ...prev };
          delete newTyping[userId];
          return newTyping;
        }
      });
    };

    socket.on("code-update", handleCodeUpdate);
    socket.on("cursor-update", handleCursorUpdate);
    socket.on("typing", handleTypingUpdate);

    return () => {
      socket.off("code-update", handleCodeUpdate);
      socket.off("cursor-update", handleCursorUpdate);
      socket.off("typing", handleTypingUpdate);
    };
  }, [joined, username, roomId]);

  const handleCodeChange = (value) => {
    setCode(value);
    socket.emit("code-change", { roomId, code: value });
    socket.emit("typing", { roomId, userId: username, username, isTyping: true });

    if (typingTimers.current[username]) {
      clearTimeout(typingTimers.current[username]);
    }
    typingTimers.current[username] = setTimeout(() => {
      socket.emit("typing", { roomId, userId: username, username, isTyping: false });
    }, 2000);
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((event) => {
      socket.emit("cursor-move", {
        roomId,
        cursorPosition: event.position,
        userId: username,
        username,
      });
    });
  };

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    Object.keys(contentWidgets.current).forEach((id) => {
      const widget = contentWidgets.current[id];
      if (widget) editor.removeContentWidget(widget);
    });

    Object.entries(remoteCursors).forEach(([id, { cursorPosition, username: remoteUsername }]) => {
      if (id === username) return;
      if (!cursorPosition || !cursorPosition.lineNumber || !cursorPosition.column) return;

      const cursorLabel = document.createElement("div");
      cursorLabel.className = `cursor-label user-${id}`;
      cursorLabel.textContent = `👤 ${remoteUsername}`;
      cursorLabel.style.color = userColors[id] || "#000";

      const cursorWidget = {
        getId: () => `cursor-label-${id}`,
        getDomNode: () => cursorLabel,
        getPosition: () => ({
          position: cursorPosition,
          preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        }),
      };

      contentWidgets.current[`cursor_${id}`] = cursorWidget;
      editor.addContentWidget(cursorWidget);

      if (typingUsers[id]) {
        const typingLabel = document.createElement("div");
        typingLabel.className = `typing-label user-${id}`;
        typingLabel.textContent = `${typingUsers[id]} is typing...`;
        typingLabel.style.color = userColors[id] || "#000";

        const typingWidget = {
          getId: () => `typing-label-${id}`,
          getDomNode: () => typingLabel,
          getPosition: () => ({
            position: {
              lineNumber: cursorPosition.lineNumber,
              column: cursorPosition.column + 5,
            },
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
          }),
        };

        editor.addContentWidget(typingWidget);
        contentWidgets.current[`typing_${id}`] = typingWidget;
      }
    });
  }, [remoteCursors, userColors, typingUsers, username]);

  const generateColor = (userId) => {
    const colors = ["#FF5733", "#33FF57", "#3357FF", "#FF33A6", "#F4C430", "#8A2BE2"];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const handleJoin = () => {
    if (enteredUsername.trim()) {
      setUsername(enteredUsername);
      setJoined(true);
    }
  };

  const handleLanguageChange = (e) => {
    const selected = e.target.value;
    let mappedLanguage = selected.toLowerCase();
    if (selected === "C++") mappedLanguage = "cpp";
    setLanguage(mappedLanguage);
  };

  return (
    <div style={{ padding: "20px" }}>
      {!joined ? (
        <div>
          <h2>Enter your name:</h2>
          <input
            type="text"
            placeholder="Enter username"
            value={enteredUsername}
            onChange={(e) => setEnteredUsername(e.target.value)}
          />
          <button onClick={handleJoin} style={{ marginLeft: "10px" }}>
            Start
          </button>
        </div>
      ) : (
        <>
          <h1>Collaborative Code Editor</h1>
          <div style={{ marginBottom: "10px" }}>
            <label htmlFor="language-select">Select Language: </label>
            <select id="language-select" value={language} onChange={handleLanguageChange}>
              <option value="javascript">JavaScript</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="c">C</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="plaintext">Plain Text</option>
            </select>
            <p style={{ fontSize: "0.9em", color: "#555" }}>
              Choose the language for proper syntax highlighting.
            </p>
          </div>
          <div style={{ border: "1px solid #ccc", borderRadius: "5px", overflow: "hidden" }}>
            <Editor
              height="500px"
              language={language}
              value={code}
              onChange={handleCodeChange}
              theme="vs-dark"
              onMount={handleEditorDidMount}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
