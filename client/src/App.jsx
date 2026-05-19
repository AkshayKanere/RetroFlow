import { Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { RetroProvider } from './context/RetroContext';
import CreateRetro from './components/CreateRetro';
import JoinForm from './components/JoinForm';
import Board from './components/Board';

export default function App() {
  return (
    <SocketProvider>
      <RetroProvider>
        <Routes>
          <Route path="/" element={<CreateRetro />} />
          <Route path="/retro/:shareCode" element={<JoinForm />} />
          <Route path="/retro/:shareCode/board" element={<Board />} />
        </Routes>
      </RetroProvider>
    </SocketProvider>
  );
}
