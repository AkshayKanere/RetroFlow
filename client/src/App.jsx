import { Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { RetroProvider } from './context/RetroContext';
import HomePage from './components/HomePage';
import CreateRetro from './components/CreateRetro';
import FacilitatorLogin from './components/FacilitatorLogin';
import JoinForm from './components/JoinForm';
import Board from './components/Board';
import FinalSummary from './components/FinalSummary';

export default function App() {
  return (
    <SocketProvider>
      <RetroProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateRetro />} />
          <Route path="/facilitator" element={<FacilitatorLogin />} />
          <Route path="/retro/:shareCode" element={<JoinForm />} />
          <Route path="/retro/:shareCode/board" element={<Board />} />
          <Route path="/retro/:shareCode/summary" element={<FinalSummary />} />
        </Routes>
      </RetroProvider>
    </SocketProvider>
  );
}
