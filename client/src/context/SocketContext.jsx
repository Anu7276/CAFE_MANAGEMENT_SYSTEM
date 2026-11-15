import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectListenersRef = useRef([]);

  useEffect(() => {
    // Determine socket endpoint
    const socketUrl = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);
    const token = localStorage.getItem('emerald_token');

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: {
        token: token || ''
      }
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      setIsReconnecting(false);

      // Re-authenticate if token exists
      const currentToken = localStorage.getItem('emerald_token');
      if (currentToken) {
        newSocket.emit('auth:staff', currentToken);
      }

      // Notify registered reconnect subscribers to refresh orders
      reconnectListenersRef.current.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('Error in reconnect handler:', e);
        }
      });
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // the disconnection was initiated by the server, reconnect manually
        newSocket.connect();
      }
      setIsReconnecting(true);
    });

    newSocket.on('connect_error', () => {
      setIsConnected(false);
      setIsReconnecting(true);
    });

    newSocket.io.on('reconnect', (attempt) => {
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectListenersRef.current.forEach((fn) => fn());
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const onReconnect = (callback) => {
    reconnectListenersRef.current.push(callback);
    return () => {
      reconnectListenersRef.current = reconnectListenersRef.current.filter((cb) => cb !== callback);
    };
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, isReconnecting, onReconnect }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  return context?.socket || null;
};

export const useSocketState = () => {
  const context = useContext(SocketContext);
  return (
    context || {
      socket: null,
      isConnected: false,
      isReconnecting: false,
      onReconnect: () => () => {}
    }
  );
};
