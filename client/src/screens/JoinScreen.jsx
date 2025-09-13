import Button from "../components/Button";

function JoinScreen({ createRoom }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-black px-4">
      <div className="rounded-xl shadow-lg p-8 w-full max-w-xl border border-neutral-800 bg-neutral-900">
        <h1 className="text-3xl font-bold mb-6 text-center text-neutral-100">
          Видеозвонки
        </h1>
        <Button className="w-full" onClick={createRoom}>
          Создать
        </Button>
      </div>
    </div>
  );
}

export default JoinScreen;