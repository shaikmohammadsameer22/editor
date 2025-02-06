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
  const [typingUsers, setTypingUsers] = useState({}); // Track which remote users are typing
  const editorRef = useRef(null);
  const monacoRef = useRef(null); // Store monaco instance here
  const contentWidgets = useRef({}); // To store content widget references
  const typingTimers = useRef({}); // To manage typing timers per user

  useEffect(() => {
    if (!joined) return;

    // Join the room once the user has provided a username
    socket.emit("join-room", { roomId, username });

    // When receiving code updates from the server
    const handleCodeUpdate = (newCode) => setCode(newCode);

    // When receiving remote cursor updates, ignore your own events
    const handleCursorUpdate = ({ userId, cursorPosition, username: remoteUsername }) => {
      if (userId === username) return; // Ignore updates from yourself

      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: { cursorPosition, username: remoteUsername },
      }));

      // If no color was assigned yet for this remote user, assign one
      setUserColors((prevColors) => {
        if (!prevColors[userId]) {
          return { ...prevColors, [userId]: generateColor(userId) };
        }
        return prevColors;
      });
    };

    // When receiving typing status updates, clear the status if not typing.
    const handleTypingUpdate = ({ userId, username: remoteUsername, isTyping }) => {
      if (userId === username) return; // Ignore your own events

      setTypingUsers((prev) => {
        // If the remote user is typing, set their name; otherwise remove their entry
        if (isTyping) {
          return { ...prev, [userId]: remoteUsername };
        } else {
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

  // Handle local code changes
  const handleCodeChange = (value) => {
    setCode(value);
    socket.emit("code-change", { roomId, code: value });
    // Emit that the current user is typing
    socket.emit("typing", { roomId, userId: username, username, isTyping: true });

    // Clear and reset the timer to stop the "typing" status after 2 seconds of inactivity
    if (typingTimers.current[username]) {
      clearTimeout(typingTimers.current[username]);
    }
    typingTimers.current[username] = setTimeout(() => {
      socket.emit("typing", { roomId, userId: username, username, isTyping: false });
    }, 2000);
  };

  // When the editor is mounted, listen for cursor movements.
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco; // Save the monaco instance

    editor.onDidChangeCursorPosition((event) => {
      // Emit the cursor position change to the server.
      socket.emit("cursor-move", {
        roomId,
        cursorPosition: event.position,
        userId: username,
        username,
      });
      // Do not update local remoteCursors state here; let remote events update that.
    });
  };

  // Render the remote cursors and typing widgets on the editor
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Remove previously added widgets
    Object.keys(contentWidgets.current).forEach((id) => {
      const widget = contentWidgets.current[id];
      if (widget) {
        editor.removeContentWidget(widget);
      }
    });

    // For each remote cursor, add a widget for the cursor label and, if applicable, a typing indicator
    Object.entries(remoteCursors).forEach(([id, { cursorPosition, username: remoteUsername }]) => {
      // Skip your own cursor (should never happen because of filtering)
      if (id === username) return;
      if (!cursorPosition || !cursorPosition.lineNumber || !cursorPosition.column) return;

      // Create the cursor label
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

      // If this remote user is marked as typing, add a typing widget
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
              // Position the typing widget a few columns to the right of the cursor.
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

  // A helper function to generate a color based on a userId.
  const generateColor = (userId) => {
    const colors = ["#FF5733", "#33FF57", "#3357FF", "#FF33A6", "#F4C430", "#8A2BE2"];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Handle joining the room by setting the username.
  const handleJoin = () => {
    if (enteredUsername.trim()) {
      setUsername(enteredUsername);
      setJoined(true);
    }
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
          <div style={{ border: "1px solid #ccc", borderRadius: "5px", overflow: "hidden" }}>
            <Editor
              height="500px"
              defaultLanguage="javascript"
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
