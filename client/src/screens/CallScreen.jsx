import { useState } from "react";
import VideoTile from "../components/VideoTile";
import AudioSink from "../components/AudioSink";
import Button from "../components/Button";
import CallControls from "../components/CallControls";
import SpeakingIndicator from "../components/SpeakingIndicator";
import DeviceSettings from "../components/DeviceSettings";
import useMountTransition from "../hooks/useMountTransition";
import { getSocket } from "../utils/socket";
import { formatDuration, formatRemaining } from "../utils/helpers";
import {
  LogOut,
  Settings,
  X,
  User,
  Hand,
  MicOff,
  Mic,
  Video,
  VideoOff,
  MonitorUp,
  Share2,
  Users,
  Lock,
  Unlock,
  MessageSquare,
  Headphones,
  RotateCcw,
} from "lucide-react";
import MicActivityDot from "../components/MicActivityDot";

function CallScreen({
  // participants data
  members,
  remoteStreams,
  stream,

  // user state
  username,
  micLevel,
  remoteLevels,
  handSignals,

  // controls state
  micOn,
  camOn,
  sharing,

  // media controls
  toggleMic,
  toggleCam,
  switchCamera,
  toggleScreenShare,

  // room controls
  roomId,
  roomLocked,
  toggleRoomLock,
  raiseHand,

  // notifications
  notifications,
  setNotifications,
  shareLinkFlipTs,
  setShareLinkFlipTs,

  // participants
  participantsOpen,
  setParticipantsOpen,

  // responsive
  isMobile,
  isTablet,

  // tools
  toolsOpen,
  setToolsOpen,

  // mic popover
  showMicPopover,
  setShowMicPopover,
  volume,
  setVolume,
  gainNodeRef,

  // chat
  chatOpen,
  setChatOpen,
  chatUnread,
  setChatUnread,
  chatMessages,
  chatInput,
  setChatInput,
  sendChat,
  chatEndRef,
  chatMobileContainerRef,
  chatDesktopContainerRef,

  // time
  elapsed,
  remainingMs,

  // cleanup function for leaving
  onLeave,

  // peer connections
  pcs,
  setRemoteStreams,
  setMembers,

  // device settings
  audioDevices = [],
  videoDevices = [],
  outputDevices = [],
  currentAudioDevice,
  currentVideoDevice,
  currentOutputDevice,
  onAudioDeviceSelect,
  onVideoDeviceSelect,
  onOutputDeviceSelect,
  onInitializeDevices,
}) {
  const socket = getSocket();

  const toolsSheetVisible = useMountTransition(
    (isMobile || isTablet) && toolsOpen,
    300
  );
  const chatDesktopVisible = useMountTransition(
    chatOpen && !isMobile && !isTablet,
    280
  );
  const chatMobileVisible = useMountTransition(
    chatOpen && (isMobile || isTablet),
    300
  );

  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);

  const handleOpenDeviceSettings = async () => {
    if (onInitializeDevices) {
      await onInitializeDevices();
    }
    setDeviceSettingsOpen(true);
  };

  const participants = [
    ...members.filter((m) => m.id !== socket?.id).map((m) => m.id),
    socket?.id,
  ];

  // Calculate optimal grid layout like Google Meet
  const getOptimalGrid = (count) => {
    if (count === 0) return { cols: 1, rows: 1 };
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count === 3 || count === 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 2, rows: 3 };
    if (count <= 9) return { cols: 3, rows: 3 };
    if (count <= 12) return { cols: 3, rows: 4 };
    if (count <= 16) return { cols: 4, rows: 4 };
    if (count <= 20) return { cols: 4, rows: 5 };
    if (count <= 25) return { cols: 5, rows: 5 };

    // For more than 25 participants, use square grid
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return { cols, rows };
  };

  const gridLayout = getOptimalGrid(participants.length);

  return (
    <div className="min-h-screen min-w-screen bg-black text-neutral-100 relative overflow-hidden">
      <div
        className="w-full h-screen grid"
        style={{
          gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`,
        }}
      >
        {participants.map((id) => {
          const streamObj = id === socket?.id ? stream : remoteStreams[id];
          const key = `p-${id}`;
          const isLocal = id === socket?.id;
          const level = isLocal ? micLevel : remoteLevels[id] || 0;
          const speaking = level > 0.18;
          const memberObj = members.find((m) => m.id === id);
          const rawName =
            id === socket?.id ? username || "" : memberObj?.name || "";
          const displayName = rawName.trim()
            ? rawName.trim().slice(0, 10)
            : id?.substring(0, 4);
          const muted = id === socket?.id ? !micOn : memberObj?.muted ?? false;

          return (
            <div
              key={key}
              className="relative bg-black flex items-center justify-center overflow-hidden border border-neutral-500/20 min-h-0"
            >
              {(() => {
                const hasActiveVideo =
                  streamObj &&
                  streamObj.getVideoTracks &&
                  streamObj
                    .getVideoTracks()
                    .some((t) => t.readyState === "live" && t.enabled);
                return hasActiveVideo;
              })() ? (
                <div className="relative w-full h-full border border-neutral-500/20">
                  <VideoTile
                    stream={streamObj}
                    muted={isLocal}
                    isScreenShare={isLocal && sharing}
                  />
                  {handSignals.some((h) => h.id === id) && (
                    <div className="absolute top-2 right-2 bg-amber-500/80 text-black text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 shadow">
                      <span className="hand-wave">
                        <Hand size={14} />
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {streamObj && streamObj.getAudioTracks().length > 0 && (
                    <AudioSink stream={streamObj} muted={isLocal} />
                  )}
                  <div className="text-neutral-400 flex items-center justify-center w-full">
                    <SpeakingIndicator
                      speaking={speaking}
                      level={level}
                      className="rounded-full"
                    >
                      <div
                        className={`relative w-12 h-12 rounded-full flex flex-col items-center justify-center text-sm font-semibold text-center transition-all border border-neutral-500/20 ${
                          isLocal
                            ? "bg-white/10 border border-white/40 text-white"
                            : "bg-neutral-800"
                        }`}
                      >
                        <User
                          size={isMobile ? 14 : 18}
                          className="opacity-80"
                        />
                        {handSignals.some((h) => h.id === id) && (
                          <div className="absolute -top-3 right-0 translate-x-1/3 bg-white/90 text-black text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                            <span className="hand-wave">
                              <Hand size={12} />
                            </span>
                          </div>
                        )}
                      </div>
                    </SpeakingIndicator>
                  </div>
                </>
              )}
              {isLocal && (
                <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full shadow">
                  Вы
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-neutral-900/70 text-xs px-2 py-1 rounded flex items-center gap-1">
                {displayName}
                {muted && <MicOff size={12} className="text-red-400" />}
              </div>
              {isLocal && camOn && (
                <Button
                  variant="outline"
                  className="absolute bottom-2 right-2 !p-1.5 !min-w-0 bg-neutral-900/70 border-neutral-700 hover:bg-neutral-800/70"
                  onClick={switchCamera}
                >
                  <RotateCcw size={12} />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="absolute top-4 right-4">
        <Button
          variant="destructive"
          className="cursor-pointer"
          onClick={onLeave}
        >
          <LogOut size={14} /> {!isMobile && "Выйти"}
        </Button>
      </div>

      <CallControls
        micOn={micOn}
        toggleMic={toggleMic}
        micLevel={micLevel}
        showMicPopover={showMicPopover}
        setShowMicPopover={setShowMicPopover}
        volume={volume}
        setVolume={setVolume}
        gainNodeRef={gainNodeRef}
        camOn={camOn}
        toggleCam={toggleCam}
        sharing={sharing}
        toggleScreenShare={toggleScreenShare}
        roomId={roomId}
        setNotifications={setNotifications}
        setShareLinkFlipTs={setShareLinkFlipTs}
        shareLinkFlipTs={shareLinkFlipTs}
        raiseHand={raiseHand}
        handSignals={handSignals}
        setParticipantsOpen={setParticipantsOpen}
        members={members}
        toggleRoomLock={toggleRoomLock}
        roomLocked={roomLocked}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        chatUnread={chatUnread}
        elapsed={elapsed}
        remainingMs={remainingMs}
        formatDuration={formatDuration}
        formatRemaining={formatRemaining}
        isMobile={isMobile}
        isTablet={isTablet}
        onDeviceSettingsOpen={handleOpenDeviceSettings}
      />

      {(isMobile || isTablet) && (
        <>
          {!toolsOpen && (
            <button
              aria-label="Tools"
              onClick={() => setToolsOpen(true)}
              className="fixed bottom-2 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 rounded-full w-12 h-12 flex items-center justify-center text-neutral-200 shadow-lg active:scale-95"
            >
              <span className="relative inline-flex">
                <Settings size={20} />
                {chatUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full px-1 leading-none py-[2px] min-w-[16px] text-center border border-white/30">
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </span>
            </button>
          )}
          {toolsSheetVisible && (
            <>
              <div
                className={`fixed inset-0 ${
                  toolsOpen ? "animate-fade-in" : "animate-fade-out"
                } bg-black/50 backdrop-blur-sm`}
                onClick={() => setToolsOpen(false)}
              />
              <div
                className={`fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 rounded-t-2xl shadow-2xl p-4 h-auto flex flex-col ${
                  toolsOpen ? "animate-sheet-in" : "animate-sheet-out"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-neutral-300">
                    Инструменты
                  </span>
                  <button
                    aria-label="Close"
                    onClick={() => setToolsOpen(false)}
                    className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 text-[11px] font-medium text-neutral-300">
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant={micOn ? "default" : "outline"}
                      className="!p-3 w-12 h-12"
                      onClick={toggleMic}
                    >
                      {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                    </Button>
                    <span>Мик</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant={camOn ? "default" : "outline"}
                      className="!p-3 w-12 h-12"
                      onClick={toggleCam}
                      disabled={sharing}
                    >
                      {camOn ? (
                        <Video size={18} className="icon-speaking-pulse" />
                      ) : (
                        <VideoOff size={18} />
                      )}
                    </Button>
                    <span>Кам</span>
                  </div>
                  {/* Screen sharing не поддерживается на мобильных устройствах из-за ограничений браузеров */}
                  {!isMobile && !isTablet && (
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant={sharing ? "default" : "outline"}
                        className="!p-3 w-12 h-12"
                        onClick={toggleScreenShare}
                      >
                        <MonitorUp
                          size={18}
                          className={sharing ? "icon-speaking-pulse" : ""}
                        />
                      </Button>
                      <span>Экран</span>
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant="outline"
                      className="!p-3 w-12 h-12"
                      onClick={() => {
                        const link = `${window.location.origin}/${roomId}`;
                        navigator.clipboard
                          .writeText(link)
                          .then(() => {
                            setNotifications((n) => [
                              ...n,
                              {
                                id: Date.now() + Math.random(),
                                text: "Ссылка скопирована",
                              },
                            ]);
                            setTimeout(
                              () => setNotifications((n) => n.slice(1)),
                              3000
                            );
                            setShareLinkFlipTs(Date.now());
                          })
                          .catch(() => {});
                      }}
                    >
                      <Share2
                        size={18}
                        className={`${
                          shareLinkFlipTs && Date.now() - shareLinkFlipTs < 1000
                            ? "icon-share-flip-once"
                            : ""
                        }`}
                      />
                    </Button>
                    <span>Линк</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant="outline"
                      className="!p-3 w-12 h-12"
                      onClick={raiseHand}
                    >
                      <span
                        className={
                          handSignals.some((h) => h.id === socket?.id)
                            ? "hand-wave"
                            : ""
                        }
                      >
                        <Hand size={18} />
                      </span>
                    </Button>
                    <span>Рука</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant="outline"
                      className="!p-3 w-12 h-12"
                      onClick={() => setParticipantsOpen((o) => !o)}
                    >
                      <Users size={18} />
                    </Button>
                    <span>Люди</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant="outline"
                      className="!p-3 w-12 h-12"
                      onClick={toggleRoomLock}
                    >
                      {roomLocked ? <Lock size={18} /> : <Unlock size={18} />}
                    </Button>
                    <span>{roomLocked ? "Откр" : "Лок"}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant={chatOpen ? "default" : "outline"}
                      className="!p-3 w-12 h-12 relative"
                      onClick={() => setChatOpen((o) => !o)}
                    >
                      <MessageSquare size={18} />
                      {chatUnread > 0 && (
                        <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full px-1 leading-none py-[2px] min-w-[16px] text-center border border-white/30">
                          {chatUnread > 99 ? "99+" : chatUnread}
                        </span>
                      )}
                    </Button>
                    <span>Чат</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Button
                      variant="outline"
                      className="!p-3 w-12 h-12"
                      onClick={handleOpenDeviceSettings}
                      aria-label="Настройки устройств"
                    >
                      <Headphones size={18} />
                    </Button>
                    <span>Устр</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-neutral-800 text-[10px] leading-tight">
                      <div className="text-center">
                        <div>{formatDuration(elapsed)}</div>
                        {remainingMs != null && (
                          <div className="text-neutral-500">
                            {formatRemaining(remainingMs)}
                          </div>
                        )}
                      </div>
                    </div>
                    <span>Время</span>
                  </div>
                </div>
                <div className="mt-4 flex justify-center items-center gap-4">
                  <MicActivityDot level={micLevel} muted={!micOn} />
                </div>
                {participantsOpen && (
                  <div className="mt-4 flex-1 overflow-y-auto rounded-lg border border-neutral-800 p-2 bg-neutral-950">
                    <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                      <Users size={14} /> Участники ({members.length})
                    </div>
                    <div className="flex flex-col gap-1 text-[11px]">
                      {members.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-neutral-800/50"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <User size={14} className="opacity-70" />
                            <span className="truncate" title={m.name}>
                              {m.name || m.id?.substring(0, 10)}
                            </span>
                          </div>
                          {m.muted && (
                            <MicOff size={14} className="text-red-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {!isMobile && !isTablet && participantsOpen && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-64 max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-lg shadow-lg p-3 flex flex-col gap-2 text-sm">
          <div className="font-semibold text-neutral-200 mb-1 flex items-center gap-2">
            <Users size={14} /> Участники ({members.length})
          </div>
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-neutral-800/50"
            >
              <div className="flex items-center gap-2 truncate">
                <User size={14} className="opacity-70" />
                <span className="truncate" title={m.name}>
                  {m.name || m.id?.substring(0, 10)}
                </span>
              </div>
              {m.muted && <MicOff size={14} className="text-red-400" />}
            </div>
          ))}
        </div>
      )}

      <div className="absolute top-6 left-6 flex flex-col gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className="bg-neutral-800 text-neutral-100 px-3 py-1 rounded shadow"
          >
            {n.text}
          </div>
        ))}
      </div>

      {chatDesktopVisible && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className={`absolute inset-0 ${
              chatOpen ? "animate-fade-in" : "animate-fade-out"
            } bg-black/60`}
            onClick={() => setChatOpen(false)}
          />
          <div
            className={`relative z-50 w-full max-w-md h-[70vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl ${
              chatOpen ? "animate-modal-in" : "animate-modal-out"
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <span className="font-semibold text-neutral-200 flex items-center gap-2">
                <MessageSquare size={16} /> Чат
              </span>
              <button
                onClick={() => setChatOpen(false)}
                className="p-2 rounded hover:bg-neutral-800 text-neutral-400"
              >
                <X size={16} />
              </button>
            </div>
            <div
              ref={chatDesktopContainerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm"
            >
              {chatMessages.length === 0 ? (
                <div className="text-neutral-500 text-center mt-8 text-xs">
                  Пока нет сообщений
                </div>
              ) : (
                chatMessages.map((m, i) => (
                  <div key={i} className="group">
                    <div className="text-[11px] text-neutral-500 mb-0.5 flex items-center gap-2">
                      <span
                        className="font-medium text-neutral-300 truncate max-w-[140px]"
                        title={m.name}
                      >
                        {m.name || m.id.slice(0, 4)}
                      </span>
                      <span>
                        {new Date(m.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="bg-neutral-800/70 rounded-lg px-3 py-2 whitespace-pre-wrap break-words leading-snug text-neutral-100">
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
              className="p-3 border-t border-neutral-800 flex items-center gap-2"
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Сообщение"
                className="flex-1 bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2 text-md focus:outline-none focus:ring-2 focus:ring-neutral-600"
              />
              <Button
                type="submit"
                disabled={!chatInput.trim()}
                className="px-3 py-2"
              >
                Отпр
              </Button>
            </form>
          </div>
        </div>
      )}

      {chatMobileVisible && (
        <div className="fixed inset-0 z-40">
          <div
            className={`absolute inset-0 ${
              chatOpen ? "animate-fade-in" : "animate-fade-out"
            } bg-black/50 backdrop-blur-sm`}
            onClick={() => setChatOpen(false)}
          />
          <div
            className={`absolute bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 rounded-t-2xl shadow-2xl flex flex-col max-h-[70vh] ${
              chatOpen ? "animate-sheet-in" : "animate-sheet-out"
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <span className="font-semibold text-neutral-200 flex items-center gap-2">
                <MessageSquare size={16} /> Чат
              </span>
              <button
                onClick={() => setChatOpen(false)}
                className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
              {chatMessages.length === 0 ? (
                <div className="text-neutral-500 text-center mt-4 text-xs">
                  Пока нет сообщений
                </div>
              ) : (
                chatMessages.map((m, i) => (
                  <div key={i} className="group">
                    <div className="text-[11px] text-neutral-500 mb-0.5 flex items-center gap-2">
                      <span
                        className="font-medium text-neutral-300 truncate max-w-[140px]"
                        title={m.name}
                      >
                        {m.name || m.id.slice(0, 4)}
                      </span>
                      <span>
                        {new Date(m.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="bg-neutral-800/70 rounded-lg px-3 py-2 whitespace-pre-wrap break-words leading-snug text-neutral-100">
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
              className="p-3 border-t border-neutral-800 flex items-center gap-2"
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Сообщение"
                className="flex-1 bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-600"
              />
              <Button
                type="submit"
                disabled={!chatInput.trim()}
                className="px-3 py-2 h-[38px]"
              >
                Отправить
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Device Settings Modal */}
      {deviceSettingsOpen && (
        <DeviceSettings
          isOpen={deviceSettingsOpen}
          onClose={() => setDeviceSettingsOpen(false)}
          audioDevices={audioDevices}
          videoDevices={videoDevices}
          outputDevices={outputDevices}
          currentAudioDevice={currentAudioDevice}
          currentVideoDevice={currentVideoDevice}
          currentOutputDevice={currentOutputDevice}
          onAudioDeviceSelect={onAudioDeviceSelect}
          onVideoDeviceSelect={onVideoDeviceSelect}
          onOutputDeviceSelect={onOutputDeviceSelect}
        />
      )}
    </div>
  );
}

export default CallScreen;
