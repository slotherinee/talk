import Button from "../components/Button";
import MicActivityDot from "../components/MicActivityDot";
import { getSocket } from "../utils/socket";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  MonitorUp,
  Share2,
  Hand,
  Users,
  Lock,
  Unlock,
  MessageSquare,
  Headphones,
} from "lucide-react";

function CallControls({
  // mic controls
  micOn,
  toggleMic,
  micLevel,
  showMicPopover,
  setShowMicPopover,
  volume,
  setVolume,
  gainNodeRef,

  // camera controls
  camOn,
  toggleCam,
  sharing,

  // screen share
  toggleScreenShare,

  // room controls
  roomId,
  setNotifications,
  setShareLinkFlipTs,
  shareLinkFlipTs,
  raiseHand,
  handSignals,
  setParticipantsOpen,
  members,
  toggleRoomLock,
  roomLocked,

  // chat
  chatOpen,
  setChatOpen,
  chatUnread,

  // time
  elapsed,
  remainingMs,

  // utility functions
  formatDuration,
  formatRemaining,

  // responsive
  isMobile,
  isTablet,

  // device settings
  onDeviceSettingsOpen,
}) {
  const socket = getSocket();

  if (isMobile || isTablet) {
    return null; // Mobile controls are handled in CallScreen
  }

  return (
    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 opacity-50 hover:opacity-100 transition-opacity">
      <div className="bg-neutral-900 bg-opacity-90 border border-neutral-800 rounded-full px-2 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 shadow-lg justify-center max-w-fit">
        <div className="relative flex items-center">
          <Button
            variant={micOn ? "default" : "outline"}
            onClick={toggleMic}
            className="h-[34px] cursor-pointer icon-hover-base icon-press transform-gpu"
          >
            {micOn ? (
              <Mic
                size={16}
                className={micLevel > 0.1 ? "icon-speaking-pulse" : ""}
              />
            ) : (
              <MicOff size={16} />
            )}
          </Button>
          {showMicPopover && micOn && (
            <div
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 shadow-lg flex items-center gap-2 z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <Volume2 size={14} className="text-neutral-400" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  if (gainNodeRef.current)
                    gainNodeRef.current.gain.value = v / 100;
                }}
                className="w-32 h-1 accent-blue-500 cursor-pointer"
              />
              <span className="text-[11px] text-neutral-300 w-8 text-right">
                {volume}%
              </span>
            </div>
          )}
        </div>
        <Button
          variant={camOn ? "default" : "outline"}
          onClick={toggleCam}
          disabled={sharing}
          className="cursor-pointer icon-hover-base icon-press"
        >
          {camOn ? (
            <Video size={16} className="icon-speaking-pulse" />
          ) : (
            <VideoOff size={16} />
          )}
        </Button>
        {/* Screen sharing скрыта на мобильных - не поддерживается браузерами */}
        {!isMobile && !isTablet && (
          <Button
            variant={sharing ? "default" : "outline"}
            onClick={toggleScreenShare}
            className="cursor-pointer icon-hover-base icon-press"
          >
            <MonitorUp
              size={16}
              className={sharing ? "icon-speaking-pulse" : ""}
            />
          </Button>
        )}
        {onDeviceSettingsOpen && (
          <Button
            variant="outline"
            onClick={onDeviceSettingsOpen}
            className="cursor-pointer icon-hover-base icon-press"
          >
            <Headphones size={16} />
          </Button>
        )}
        <Button
          variant="outline"
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
                setTimeout(() => setNotifications((n) => n.slice(1)), 3000);
                setShareLinkFlipTs(Date.now());
              })
              .catch(() => {});
          }}
          className="cursor-pointer icon-hover-base icon-press"
        >
          <Share2
            size={16}
            className={`icon-share-intro ${
              shareLinkFlipTs && Date.now() - shareLinkFlipTs < 1000
                ? "icon-share-flip-once"
                : ""
            }`}
          />
        </Button>
        <Button
          variant="outline"
          onClick={raiseHand}
          className="cursor-pointer icon-hover-base icon-press"
        >
          <span
            className={
              handSignals.some((h) => h.id === socket?.id) ? "hand-wave" : ""
            }
          >
            <Hand size={16} />
          </span>
        </Button>
        <Button
          variant="outline"
          onClick={() => setParticipantsOpen((o) => !o)}
          className="cursor-pointer icon-hover-base icon-press"
        >
          <Users size={16} />
          <span className="text-xs">{members.length}</span>
        </Button>
        <Button
          variant="outline"
          onClick={toggleRoomLock}
          className={`cursor-pointer icon-hover-base icon-press ${
            roomLocked ? "icon-lock-shake" : ""
          }`}
        >
          {roomLocked ? <Lock size={16} /> : <Unlock size={16} />}
        </Button>
        <Button
          variant={chatOpen ? "default" : "outline"}
          onClick={() => setChatOpen((o) => !o)}
          className="relative cursor-pointer icon-hover-base icon-press"
        >
          <MessageSquare size={16} />
          {chatUnread > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full px-1 leading-none py-[2px] min-w-[16px] text-center border border-white/30 chat-badge-anim">
              {chatUnread > 99 ? "99+" : chatUnread}
            </span>
          )}
        </Button>
        <div className="text-xs text-neutral-300 px-2 py-1 rounded bg-neutral-800/60 whitespace-nowrap h-[34px] w-[100px] flex items-center justify-center">
          {formatDuration(elapsed)}
          {remainingMs != null && (
            <span className="text-neutral-500 ml-1">
              / {formatRemaining(remainingMs)}
            </span>
          )}
        </div>
        <MicActivityDot level={micLevel} muted={!micOn} className="ml-1" />
      </div>
    </div>
  );
}

export default CallControls;
