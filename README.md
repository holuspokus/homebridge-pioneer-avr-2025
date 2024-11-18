
# homebridge-pioneer-avr-2025

A [Homebridge](https://github.com/nfarina/homebridge) plugin that integrates your Pioneer AVR as a TV accessory in HomeKit. This project is compatible with Node 22 and below, as well as Homebridge 2 or earlier versions. It is written in TypeScript and leverages the latest Homebridge methods and practices, ensuring a streamlined setup with optional manual configuration. The plugin automatically detects your receiver, even in environments with dynamic IP addresses, for a more reliable user experience.

> **Note**: This plugin is specifically designed for Pioneer models released before 2017 that use Pioneer Telnet Commands (e.g., VSX-922). It may not be compatible with newer models that use the ISCP protocol (e.g., VSX-LX304). For newer models, please consider using the [homebridge-onkyo-pioneer](https://github.com/nitaybz/homebridge-onkyo-pioneer) plugin or see the "Alternatives" section below.

![npm](https://img.shields.io/npm/v/homebridge-pioneer-avr-2025) ![license](https://img.shields.io/badge/license-MIT-blue) ![PRs](https://img.shields.io/github/issues-pr/holuspokus/homebridge-pioneer-avr-2025) ![Issues](https://img.shields.io/github/issues/holuspokus/homebridge-pioneer-avr-2025)
<br>

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
<br>

> **Migration Note**: If upgrading from the homebridge-pioneer-avr plugin to homebridge-pioneer-avr-2025, it is recommended to remove the old plugin and delete any existing accessories within the Homebridge settings or reset Homebridge entirely. Additionally, rebooting iOS devices is advisable for a smooth transition.

<br>

## Installation
1. **Install Homebridge**: Follow the [Homebridge Installation Guide](https://github.com/homebridge/homebridge/wiki).
2. **Install the Plugin**: Use the Homebridge Web Interface (Config-UI) to install **homebridge-pioneer-avr-2025**.


### Migration from 0.1.4 to 0.2.0
To complete the migration from version 0.1.4 to 0.2.0 of the plugin, you need to open the plugin configuration in the Homebridge Config UI and save it, make no changes. This ensures that the new configuration format is applied and the plugin can start without issues. Restart Homebridge. The plugin analyzes the config.json file and adjusts it automatically; in this case, another restart of Homebridge is necessary.  
Now the plugin can be configured as desired.    
<br>

## Accessory Configuration
The receiver is detected automatically over the network.

Manual configuration is also available, and previous configurations from older Versions or from the [homebridge-pioneer-avr](https://github.com/kazcangi/homebridge-pioneer-avr) plugin will be imported automatically if present. You may also configure settings via the Config-UI interface.

### Preparing the Receiver and Network
To ensure proper connectivity for the plugin, connect the receiver to the network. The simplest way to verify that the receiver is accessible is to check if an iPhone can establish an AirPlay connection to the receiver. If this works, the receiver is ready. Otherwise, ensure the following:

1.  The receiver and Homebridge server must be connected to the same network and subnet to enable compatibility with Bonjour/Multicast discovery. This configuration is typically standard for home networks.

2.  If the router lacks a built-in DHCP server, a manual network setup on the receiver will be necessary.

3.  Enable “Network Standby” in the receiver’s network settings to ensure it remains accessible on the network (see the receiver’s manual for details).

After confirming the network connection, restart the plugin to enable communication with the receiver.
<br><br><br><br>

## Links
- [homebridge](https://github.com/nfarina/homebridge)
- [homebridge-pioneer-avr](https://github.com/kazcangi/homebridge-pioneer-avr)
- [pioneer-receiver-notes](https://github.com/rwifall/pioneer-receiver-notes)
- [homebridge-webos-tv](https://github.com/merdok/homebridge-webos-tv)
- [homebridge-vsx](https://github.com/TG908/homebridge-vsx)
<br>

## Alternatives
- [homebridge-onkyo-pioneer](https://www.npmjs.com/package/homebridge-onkyo-pioneer)
- [homebridge-onkyo](https://www.npmjs.com/package/homebridge-onkyo)
- [home-assistant](https://www.home-assistant.io/integrations/pioneer/)
- [openhab.org](https://www.openhab.org/addons/bindings/pioneeravr/)
<br>

## Release Notes Platform Version
- **v0.2.0**: Rewritten as a platform plugin in TypeScript for enhanced future-proofing and extensibility.

## Release Notes Accessory Version
- **v0.1.6**: Fixes a bug where the receiver would start when the plugin started. Preparations for the transition of the plugin from Accessory to Platform. To ensure a smooth transition, this version should be installed before version 0.2.0.
- **v0.1.5**: Withdrawn.
- **v0.1.4**: Little fixes
- **v0.1.3**: Improved communication of device status with HomeKit and fixed a bug with volume control in the iOS Remote.
- **v0.1.2**: Fixed an issue where "Web Interface enabled" unintentionally turned on the receiver.
- **v0.1.1**: Reduced npm dependencies and updated `package.json`, less info-logging.
- **v0.1.0**: Some final improvements for stabilization.
- **v0.0.9**: Fixed an issue related to volume control on Apple Watch.
- **v0.0.8**: Volume as Lightbulb works even finer now!
- **v0.0.7**: Volume as Lightbulb works fine now.
- **v0.0.6**: The volume can now be adjusted within the Home icon of the receiver.
- **v0.0.5**: The unused Remote-Key "Play/Pause" can now be used to toggle Listening-Mode.
- **v0.0.4**: Plugin-Name in README fixed.
- **v0.0.3**: Input 46 -> AIRPLAY added.
- **v0.0.2**: Fixes.
- **v0.0.1**: Enhanced performance and responsiveness of the Pioneer AVR receiver.
- **v0.0.0**: Forked homebridge-pioneer-avr.
<br>
