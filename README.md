<p align="center">
  <img width="747" height="290" alt="hb x vav" src="https://github.com/user-attachments/assets/d4b259cc-923a-435f-8103-6b44b816eca0" />
</p>

# homebridge-otodo-vav

[![npm version](https://img.shields.io/npm/v/homebridge-otodo-vav.svg)](https://www.npmjs.com/package/homebridge-otodo-vav)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-otodo-vav.svg)](https://www.npmjs.com/package/homebridge-otodo-vav)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![verified-by-homebridge](https://img.shields.io/badge/_-verified-blueviolet?color=%23491F59&style=flat&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

> A Homebridge plugin to integrate OTO Do VAV thermostats into HomeKit

---

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

## 🔧✨ Optional Feature: Mode Sliders

The plugin can optionally create a Mode Slider accessory for each thermostat.
This slider allows you to change the Otodo/VAV mode by selecting one of six predefined positions.

### Available modes
| Slider Position | WorkingMode | Mode Name (Otodo) | Description             |
| --------------- | ----------- | ----------------- | ----------------------- |
| 0%              | 0           | Auto              | Follows weekly schedule |
| 20%             | 1           | Confort           | Comfort temperature     |
| 40%             | 2           | -1°C              | Comfort –1°C            |
| 60%             | 3           | -2°C              | Comfort –2°C            |
| 80%             | 4           | Eco               | Energy saving mode      |
| 100%            | 5           | Antigel           | Frost protection        |

The slider automatically snaps to the closest valid value.

### Enable or disable Mode Sliders
You can control whether these mode sliders appear in HomeKit using the following configuration option:
```json
"displayModeSliders": true
```

- `"displayModeSliders": true` → Each thermostat gets a “Mode” slider accessory
- `"displayModeSliders": false` → Mode sliders are removed and hidden

Thermostat accessories continue to work normally either way.


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
