import { useState, useEffect } from "react";
import { ChevronDown, Mic, Video, Volume2, Check } from "lucide-react";
import Button from "./Button";

function DeviceSelector({
  type, // 'audio', 'video', 'audioOutput'
  currentDeviceId,
  onDeviceSelect,
  devices,
  disabled = false,
  className = "",
  size = "default", // "small", "default", "large"
}) {
  const [isOpen, setIsOpen] = useState(false);

  const getIcon = () => {
    switch (type) {
      case "audio":
        return <Mic size={size === "small" ? 14 : 16} />;
      case "video":
        return <Video size={size === "small" ? 14 : 16} />;
      case "audioOutput":
        return <Volume2 size={size === "small" ? 14 : 16} />;
      default:
        return null;
    }
  };

  const getLabel = () => {
    switch (type) {
      case "audio":
        return "Микрофон";
      case "video":
        return "Камера";
      case "audioOutput":
        return "Динамики";
      default:
        return "Устройство";
    }
  };

  const currentDevice = devices.find((d) => d.deviceId === currentDeviceId);
  const currentLabel = currentDevice?.label || `${getLabel()} по умолчанию`;

  const handleDeviceSelect = (deviceId) => {
    onDeviceSelect(deviceId);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && !event.target.closest(".device-selector")) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (devices.length <= 1) {
    return (
      <div className={`flex items-center gap-2 text-neutral-400 ${className}`}>
        {getIcon()}
        <span className={`text-${size === "small" ? "xs" : "sm"} truncate`}>
          {currentLabel}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative device-selector ${className}`}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 ${
          size === "small" ? "px-2 py-1 text-xs" : "px-3 py-2"
        } max-w-[200px]`}
      >
        {getIcon()}
        <span className="truncate flex-1 text-left">{currentLabel}</span>
        <ChevronDown
          size={size === "small" ? 12 : 14}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {devices.map((device) => (
            <button
              key={device.deviceId}
              onClick={() => handleDeviceSelect(device.deviceId)}
              className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2 text-sm"
            >
              <span className="flex-1 truncate">{device.label}</span>
              {device.deviceId === currentDeviceId && (
                <Check size={14} className="text-blue-500" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DeviceSelector;
