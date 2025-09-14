import Input from "../components/Input";
import Button from "../components/Button";

function LobbyScreen({ roomId, tempName, setTempName, startCall }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-black px-4">
      <div className="rounded-xl shadow-lg p-8 w-full max-w-xl border border-neutral-800 bg-neutral-900">
        <p className="mb-4 text-lg text-neutral-100">Room: {roomId}</p>
        <Input
          type="text"
          placeholder="Ваше имя (опционально)"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
        />
        <Button className="w-full" onClick={startCall}>
          Подключиться
        </Button>
        <div className="text-xs text-neutral-600 mt-4 break-all">
          Поделиться ссылкой: {window.location.origin}/{roomId}
        </div>
      </div>
    </div>
  );
}

export default LobbyScreen;
