import { useState, useEffect } from "react";
import { Settings, X } from "lucide-react";
import Button from "./Button";
import DeviceSelector from "./DeviceSelector";

function DeviceSettings({
  isOpen,
  onClose,
  audioDevices = [],
  videoDevices = [],
  audioOutputDevices = [],
  currentAudioDevice,
  currentVideoDevice,
  currentAudioOutputDevice,
  onAudioDeviceSelect,
  onVideoDeviceSelect,
  onAudioOutputDeviceSelect,
  className = "",
}) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative z-50 w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl ${className}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Settings size={18} />
            <span className="font-semibold text-neutral-200">
              Настройки устройств
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-neutral-800 text-neutral-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Микрофон
            </label>
            <DeviceSelector
              type="audio"
              currentDeviceId={currentAudioDevice}
              onDeviceSelect={onAudioDeviceSelect}
              devices={audioDevices}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Камера
            </label>
            <DeviceSelector
              type="video"
              currentDeviceId={currentVideoDevice}
              onDeviceSelect={onVideoDeviceSelect}
              devices={videoDevices}
              className="w-full"
            />
          </div>

          {audioOutputDevices.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Динамики
              </label>
              <DeviceSelector
                type="audioOutput"
                currentDeviceId={currentAudioOutputDevice}
                onDeviceSelect={onAudioOutputDeviceSelect}
                devices={audioOutputDevices}
                className="w-full"
              />
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-neutral-800 flex justify-end">
          <Button variant="outline" onClick={onClose} className="px-4">
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DeviceSettings;
