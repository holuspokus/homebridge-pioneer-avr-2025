
# homebridge-pioneer-avr-2025

A [Homebridge](https://github.com/nfarina/homebridge) plugin that integrates your Pioneer AVR as a TV accessory in HomeKit. This project supports Node.js versions up to 22 and is compatible with Homebridge version 2 and earlier. Developed in TypeScript and as a Platform, it incorporates modern Homebridge practices and methods to provide a seamless setup process with optional manual configuration. The plugin features automatic receiver detection, enhancing reliability and ease of use.

While the plugin is not perfect, I hope it provides a dependable way to connect your receiver to HomeKit.

> **Note**: This plugin is specifically designed for Pioneer models released before 2017 that use Pioneer Telnet Commands (e.g., VSX-922). It may not be compatible with newer models that use the ISCP protocol (e.g., VSX-LX304). For newer models, please consider using the [homebridge-onkyo-pioneer](https://github.com/nitaybz/homebridge-onkyo-pioneer) plugin or see the "Alternatives" section below.

![npm](https://img.shields.io/npm/v/homebridge-pioneer-avr-2025) ![license](https://img.shields.io/badge/license-MIT-blue) ![PRs](https://img.shields.io/github/issues-pr/holuspokus/homebridge-pioneer-avr-2025) ![Issues](https://img.shields.io/github/issues/holuspokus/homebridge-pioneer-avr-2025)
<br>

## Features
This plugin allows you to control various aspects of your Pioneer AVR directly from your Home app, including:

* Power On/Off control
* Input selection with ease
* Volume adjustment (presented as a Lightbulb control in the Home app)
* Customizing the visibility of inputs
* Renaming inputs for easier identification
* Remote control functionality on iOS devices
* Using the iOS Remote's "Play/Pause" button to toggle between EXTENDED STEREO and PRO LOGIC 2 MOVIE modes
* Automatic input discovery for seamless setup
* Automatic receiver discovery for effortless integration
* Easily switch between inputs using HomeKit switches for direct control and enhanced automation capabilities
<br>
<br>

## Installation
1. **Install Homebridge**: Follow the [Homebridge Installation Guide](https://github.com/homebridge/homebridge/wiki).
2. **Install the Plugin**: Use the Homebridge Web Interface (Config-UI) to install **homebridge-pioneer-avr-2025**.

## Accessory Configuration
The receiver is detected automatically over the network.

Manual configuration is also available, and previous configurations from older Versions or from the [homebridge-pioneer-avr](https://github.com/kazcangi/homebridge-pioneer-avr) plugin will be imported automatically if present. You may also configure settings via the Config-UI interface.

### Adding Input Switches
Once the receiver's inputs are loaded, you can select up to five inputs through the plugin settings in Config-UI. These selected inputs will appear in HomeKit as individual switches, allowing direct selection, use in automations, or integration with physical switches.

### Preparing the Receiver and Network
To ensure proper connectivity for the plugin, connect the receiver to the network. The simplest way to verify that the receiver is accessible is to check if an iPhone can establish an AirPlay connection to the receiver. If this works, the receiver is ready. Otherwise, ensure the following:

1. **Ensure Network Compatibility**  
   The receiver and Homebridge server must be connected to the same network and subnet to enable compatibility with Bonjour/Multicast discovery. This configuration is typically standard for home networks.

2. **Enable DHCP and DNS**  
   For local hostname resolution (e.g., `vsx-922.local`), configure the Homebridge server to use DHCP and ensure the router is set as the DNS server. This allows proper name resolution for devices on the local network without requiring manual IP entries.

3. **Set Up the Receiver’s Network**  
   If the router lacks a built-in DHCP server, you will need to configure the receiver’s network settings manually.

4. **Enable “Network Standby”**  
   Enable “Network Standby” in the receiver’s network settings to ensure it remains accessible on the network, even when not actively in use. Refer to the receiver’s manual for specific instructions.

After confirming the network connection, restart the plugin to enable communication with the receiver.
<br><br>

## Manual installation:
1. **Install the Homebridge framework:**
   ```bash
   npm install -g homebridge
   ```

2. **Update your configuration file:** Use the example below or check `sample-config.json` in this repository for a sample. Create or edit the `config.json` file in the Homebridge directory (typically `~/.homebridge/` or `/var/lib/homebridge/`) with the appropriate configuration for your Pioneer AVR.

3. **Install **homebridge-pioneer-avr-2025**:**
   ```bash
   sudo hb-service add homebridge-pioneer-avr-2025
      or
   npm install -g homebridge-pioneer-avr-2025
   ```

4. **Start Homebridge:**
   ```bash
   sudo hb-service restart
      or
   homebridge
   ```

### Accessory Configuration Example

Below is a sample configuration for your accessory:

#### Discovery
```json
"platforms": [
    {
        "platform": "pioneerAvr2025",
        "name": "pioneerAvr2025"
    }
]
```

#### minimalistic Setup
```json
"platforms": [
    {
        "platform": "pioneerAvr2025",
        "name": "pioneerAvr2025",
        "host": "VSX-922.local",
        "port": 23,
        "maxVolume": 65,
        "minVolume": 30
    }
]
```

|          Key | Value                         |
| -----------: | :---------------------------- |
|     platform | don't change                  |
|         name | Custom input, can remain      |
|         host | needs to be accurate or empty |
|         port | needs to be accurate          |
|    maxVolume | Optional input, can remain    |
|    minVolume | Optional input, can remain    |

> **name:**
> In the example above, the "name" field refers to the platform and is used to define the name of the platform in Homebridge, for example, as visible in the logs. The device name, in this case, is derived from the hostname unless the hostname is an IP address, in which case the platform name is used instead.
> Characters that could cause issues are automatically removed.

> **host:**
> To use the network scan (Multicast), leave `host` field empty in the plugin configuration.

> **port:**  
> The port used for Telnet to connect to your receiver.  
> If port 23 does not work, try port 8102.  
> Alternatively, enable Web Interface (see user manual) and then try opening in your web browser something like:
> `http://vsx-922.local/1000/port_number.asp` or  
> `http://192.168.178.99/1000/port_number.asp`  
> ... to find the port number.

> **maxVolume:**  
> A number between 0 and 100; for example, 60 means 60% of the max volume.  
> 100 = -0dB (i.e., 185 = No Limit),  
> 60 = -16dB,  
> 0: disables the volume as brightness feature  
> Defaults to 80 if undefined.  
> A value of 60 has worked well for me.  

> **Note:** The difference between `maxVolume` and `minVolume` should be at least 20.  
> Both only affects the volume as a brightness feature, not the remote.

> **minVolume:**  
> A number between 0 and 100; for example, 30 means 30% of the max volume.  
> Defaults to 20 if undefined.  
> This setting is only active in combination with `maxVolume`.  
> A value of 35 has worked well for me.  

> **inputSwitches:**
> Set up to 5 inputs to expose as switches in HomeKit

> **name:**
> In the example below, "name" under "devices" refers to the name as it appears in HomeKit.
> Characters that could cause issues are automatically removed.

#### Over-the-top unrealistic setup
```json
"platforms": [
    {
        "platform": "pioneerAvr2025",
        "name": "pioneerAvr2025",
        "devices": [
            {
                "host": "VSX-922.local",
                "port": 23,
                "name": "VSX922",
                "inputSwitches": [
                    "20",
                    "25",
                    "01",
                    "04"
                ]
            },
            {
                "ip": "196.168.1.2",
                "port": 23,
                "name": "VSX923",
                "maxVolume": 75,
                "minVolume": 20
            },
            {
                "ip": "196.168.3.19",
                "port": 8102,
                "name": "VSX924",
                "maxVolume": 100,
                "minVolume": 20,
                "inputSwitches": [
                    "02",
                    "03",
                    "04",
                    "05",
                    "25"
                ]
            },
            {
                "ip": "VSX-1120.local",
                "port": 24,
                "name": "VSX1120"
            }
        ],
        "maxVolume": 65,
        "minVolume": 30,
        "_bridge": {
            "username": "0E:D6:86:BA:AM:69",
            "port": 35337
        }
    }
]
```

#### After Discovery
Set Input switches for discovered Devices
```json
"platforms": [
    {
        "platform": "pioneerAvr2025",
        "name": "pioneerAvr2025",
        "discoveredDevices": [
            {
                "host": "VSX-922.local",
                "inputSwitches": [
                    "20",
                    "25",
                    "01",
                    "04"
                ]
            }
        ]
    }
]
```

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
- **v0.2.1**: Optimized saving of input visibility and improved ordering of inputs in the Config-UI.
- **v0.2.0**: Rewritten as a platform plugin in TypeScript for enhanced future-proofing and extensibility. Added switches.

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
