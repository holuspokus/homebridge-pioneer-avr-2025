# homebridge-pioneer-avr-2025

A [Homebridge](https://github.com/nfarina/homebridge) plugin that integrates your Pioneer AVR as a TV accessory in HomeKit. This project is compatible with Node 22 and below, as well as Homebridge 2 or earlier versions. It is written in TypeScript and leverages the latest Homebridge methods and practices, ensuring a streamlined setup with optional manual configuration. The plugin automatically detects your receiver, even in environments with dynamic IP addresses, for a more reliable user experience.

> **Note**: This plugin is specifically designed for Pioneer models using the PRONTO protocol (e.g., VSX-922) and may not be compatible with newer models that use the ISCP protocol (e.g., VSX-LX304). For newer models, please consider using the [homebridge-onkyo-pioneer](https://github.com/nitaybz/homebridge-onkyo-pioneer) plugin or see the "Alternatives" section below.


![npm](https://img.shields.io/npm/v/homebridge-pioneer-avr-2025) ![license](https://img.shields.io/badge/license-MIT-blue) ![PRs](https://img.shields.io/github/issues-pr/holuspokus/homebridge-pioneer-avr-2025) ![Issues](https://img.shields.io/github/issues/holuspokus/homebridge-pioneer-avr-2025)


## Features
With this plugin, you gain the ability to control multiple aspects of your Pioneer AVR, including:

* Power On/Off control
* Input selection directly within the Home app
* Volume adjustment (available as a Lightbulb control in the Home app)
* Customize visibility of inputs in the Home app
* Rename inputs for personalized identification
* Remote control functionality on iOS devices
* Use the iOS Remote's "Play/Pause" button to toggle between EXTENDED STEREO and PRO LOGIC 2 MOVIE modes
* Automatic input discovery

> The plugin is designed to function seamlessly out of the box—just install and start using it!


> **Migration Note**: If upgrading from the homebridge-pioneer-avr plugin to homebridge-pioneer-avr-2025, it is recommended to remove the old plugin and delete any existing accessories within the Homebridge settings or reset Homebridge entirely. Additionally, rebooting iOS devices is advisable for a smooth transition.
> Cleaning up the Homebridge configuration file ([config.json](https://github.com/homebridge/homebridge/wiki/Homebridge-Config-JSON-Explained)) is recommended but not required.

## Installation
1. **Install Homebridge**: Follow the [Homebridge Installation Guide](https://github.com/homebridge/homebridge/wiki).
2. **Install the Plugin**: Use the Homebridge Web Interface (Config-UI) to install **homebridge-pioneer-avr-2025**.

## Accessory Configuration
The receiver is detected automatically over the network.

Manual configuration is also available, and previous configurations from the [homebridge-pioneer-avr](https://github.com/kazcangi/homebridge-pioneer-avr) plugin will be imported automatically if present. You may also configure settings via the Config-UI interface.

## Links
- [homebridge](https://github.com/nfarina/homebridge)
- [homebridge-pioneer-avr](https://github.com/kazcangi/homebridge-pioneer-avr)
- [pioneer-receiver-notes](https://github.com/rwifall/pioneer-receiver-notes)
- [homebridge-webos-tv](https://github.com/merdok/homebridge-webos-tv)
- [homebridge-vsx](https://github.com/TG908/homebridge-vsx)

## Alternatives
- [homebridge-onkyo-pioneer](https://www.npmjs.com/package/homebridge-onkyo-pioneer)
- [homebridge-onkyo](https://www.npmjs.com/package/homebridge-onkyo)
- [home-assistant](https://www.home-assistant.io/integrations/pioneer/)
- [openhab.org](https://www.openhab.org/addons/bindings/pioneeravr/)

## Release Notes
- **v0.2.0**: Rewritten as a platform plugin in TypeScript for enhanced future-proofing and extensibility.
- **v0.1.4**: Minor fixes.
- **v0.1.3**: Improved device status communication with HomeKit and fixed volume control bug on iOS Remote.
- **v0.1.2**: Resolved an issue where enabling "Web Interface" inadvertently turned on the receiver.
- **v0.1.1**: Reduced npm dependencies, updated `package.json`, and minimized info logging.
- **v0.1.0**: Stability enhancements.
- **v0.0.9**: Resolved volume control issue on Apple Watch.
- **v0.0.8**: Improved volume control (as Lightbulb) functionality.
- **v0.0.7**: Enhanced Lightbulb volume control functionality.
- **v0.0.6**: Added volume control within the receiver's Home icon.
- **v0.0.5**: Enabled "Play/Pause" Remote-Key for toggling listening modes.
- **v0.0.4**: Fixed plugin name in README.
- **v0.0.3**: Added "AIRPLAY" input (Input 46).
- **v0.0.2**: Minor fixes.
- **v0.0.1**: Enhanced performance and responsiveness for Pioneer AVR receivers.
- **v0.0.0**: Forked from homebridge-pioneer-avr.
