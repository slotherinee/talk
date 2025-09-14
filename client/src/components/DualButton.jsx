import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Button from "./Button";
import DeviceSelector from "./DeviceSelector";

function DualButton({
  mainButton,
  devices,
  currentDeviceId,
  onDeviceSelect,
  type,
  disabled = false,
  className = "",
}) {
  const [showDevices, setShowDevices] = useState(false);

  return (
    <div className={`flex ${className}`}>
      {/* Основная кнопка */}
      <div className="flex-1">{mainButton}</div>

      {/* Кнопка выбора устройства */}
      <div className="relative">
        <Button
          variant="outline"
          onClick={() => setShowDevices(!showDevices)}
          disabled={disabled || devices.length === 0}
          className="!px-2 !py-2 border-l-0 rounded-l-none h-full"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${
              showDevices ? "rotate-180" : ""
            }`}
          />
        </Button>

        {showDevices && devices.length > 0 && (
          <div className="absolute top-full right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-50 min-w-[200px] max-h-48 overflow-y-auto">
            <div className="p-2 border-b border-neutral-700 text-xs text-neutral-400 font-medium">
              {type === "audio" ? "Выберите микрофон" : "Выберите камеру"}
            </div>
            {devices.map((device) => (
              <button
                key={device.deviceId}
                onClick={() => {
                  onDeviceSelect(device.deviceId);
                  setShowDevices(false);
                }}
                className={`w-full px-3 py-2 text-left hover:bg-neutral-700 text-sm border-b border-neutral-700 last:border-b-0 ${
                  device.deviceId === currentDeviceId
                    ? "bg-neutral-700 text-blue-400"
                    : "text-neutral-200"
                }`}
              >
                <div className="truncate">{device.label}</div>
                {device.deviceId === currentDeviceId && (
                  <div className="text-xs text-neutral-400 mt-0.5">Текущий</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DualButton;
