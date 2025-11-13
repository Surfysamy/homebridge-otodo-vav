# homebridge-otodo-vav

[![npm version](https://img.shields.io/npm/v/homebridge-otodo-vav.svg)](https://www.npmjs.com/package/homebridge-otodo-vav)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-otodo-vav.svg)](https://www.npmjs.com/package/homebridge-otodo-vav)
![License](https://img.shields.io/github/license/Surfysamy/homebridge-otodo-vav.svg)

> A Homebridge plugin to integrate OTO Do VAV thermostats into HomeKit

---

<p align="center">
  <img src="https://raw.githubusercontent.com/Surfysamy/homebridge-otodo-vav/latest/.github/images/homekit-thermostat-example.png" width="320" />
</p>

## 📝 Description
This plugin allows you to connect your **OTO Do VAV thermostat** to HomeKit via Homebridge.  
You will be able to view and control the thermostat from the Apple Home app and use Siri voice commands.

---

## ✨ Features
- Exposes your OTO Do VAV thermostat as a native Apple Home accessory.
- Read and control:
  - Current temperature
  - Target temperature
  - Heating/Cooling mode (if your device supports it)
- Automatic state synchronization between HomeKit and your device.
- Lightweight and easy to configure.
- Compatible with Homebridge v1 and v2.

---

## 📦 Installation

Install globally using npm on your Homebridge server:

```bash
sudo npm install -g homebridge-otodo-vav
```

## ⚙️ Configuration
Add a new platform entry in your `config.json`:
```json
{
  "platforms": [
    {
      "platform": "otodo-vav",
      "name": "My OTO Do Thermostat",
      "host": "192.168.1.100",
      "pollInterval": 60
    }
  ]
}
```

## Options
| Key            | Type   | Required | Description                               |
| -------------- | ------ | -------- | ----------------------------------------- |
| `platform`     | string | ✅        | Must be `"otodo-vav"`                     |
| `name`         | string | ✅        | Display name in HomeKit                   |
| `host`         | string | ✅        | Device IP / hostname                      |
| `pollInterval` | number | ❌        | Polling interval in seconds (default: 60) |

## 🚀 Usage

1. Install plugin
3. Add configuration to config.json
4. Restart Homebridge
5. The thermostat appears in the Apple Home app
6. Control it using:
    - Home app
    - Siri voice commands
    - Automations and scenes

## 🧑‍💻 Development
```bash
git clone https://github.com/Surfysamy/homebridge-otodo-vav.git
cd homebridge-otodo-vav
npm install
npm run build
npm link
homebridge -D
```

## ❤️ Contributing
Contributions are welcome !
- Open an issue for bugs or feature requests
- Submit pull requests for improvements
- Star the repository if you like the plugin ⭐
