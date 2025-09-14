import Button from "../components/Button";
import Input from "../components/Input";
import MicActivityDot from "../components/MicActivityDot";
import DualButton from "../components/DualButton";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";

function PrecallScreen({
  micOn,
  camOn,
  micLevel,
  toggleMic,
  toggleCam,
  localVideo,
  stream,
  startCall,
  roomId,
  tempName,
  setTempName,
  // Device selection props
  audioDevices = [],
  videoDevices = [],
  currentAudioDevice,
  currentVideoDevice,
  onAudioDeviceSelect,
  onVideoDeviceSelect,
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-black px-4">
      <div className="rounded-xl shadow-lg p-8 w-full max-w-xl border border-neutral-800 bg-neutral-900">
        <h2 className="text-2xl font-bold mb-4 text-neutral-100">
          Настройка перед звонком
        </h2>

        <div className="mb-4">
          <Input
            type="text"
            placeholder="Ваше имя (необязательно)"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            maxLength={10}
          />
        </div>

        <div className="flex flex-col gap-4 mb-4">
          <DualButton
            mainButton={
              <Button
                variant={micOn ? "default" : "outline"}
                className="w-full rounded-r-none"
                onClick={toggleMic}
              >
                {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                Микрофон
                <MicActivityDot level={micLevel} muted={!micOn} />
              </Button>
            }
            devices={audioDevices}
            currentDeviceId={currentAudioDevice}
            onDeviceSelect={onAudioDeviceSelect}
            type="audio"
            className="flex-1"
          />

          <DualButton
            mainButton={
              <Button
                variant={camOn ? "default" : "outline"}
                className="w-full rounded-r-none"
                onClick={toggleCam}
              >
                {camOn ? (
                  <Video size={16} className="icon-speaking-pulse" />
                ) : (
                  <VideoOff size={16} />
                )}
                {camOn ? "Камера: Вкл" : "Камера: Выкл"}
              </Button>
            }
            devices={videoDevices}
            currentDeviceId={currentVideoDevice}
            onDeviceSelect={onVideoDeviceSelect}
            type="video"
            className="flex-1"
          />
        </div>

        <div className="mb-4 flex justify-center">
          {camOn ? (
            <video
              ref={localVideo}
              autoPlay
              muted
              playsInline
              className="w-full h-36 rounded-lg bg-black border border-neutral-800 object-cover transform -scale-x-100"
            />
          ) : (
            <div className="w-full h-36 rounded-lg bg-neutral-800 border border-neutral-800 flex items-center justify-center text-neutral-500">
              Камера выключена
            </div>
          )}
        </div>

        <Button className="w-full" onClick={startCall}>
          Войти в звонок
        </Button>

        <div className="text-xs text-neutral-600 mt-3 break-all">
          Ссылка: {window.location.origin}/{roomId}
        </div>
      </div>
    </div>
  );
}

export default PrecallScreen;
