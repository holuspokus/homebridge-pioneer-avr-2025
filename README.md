# homebridge-pioneer-avr-2025

A [Homebridge](https://github.com/nfarina/homebridge) plugin that allows you to declare your Pioneer AVR as a TV in HomeKit. This project is ready for Node 22 or lower, Homebridge 2 or lower and is forked from [homebridge-pioneer-avr](https://github.com/kazcangi/homebridge-pioneer-avr).  

> This plugin is specifically designed for Pioneer models that utilize the PRONTO protocol (e.g., VSX-922). It is not intended for newer models that use the ISCP protocol (e.g., VSX-LX304). For those newer models, we recommend using the [homebridge-onkyo-pioneer](https://github.com/nitaybz/homebridge-onkyo-pioneer) plugin or checking the "Alternatively" section below.


![npm](https://img.shields.io/npm/v/homebridge-pioneer-avr-2025) ![license](https://img.shields.io/badge/license-MIT-blue) ![PRs](https://img.shields.io/github/issues-pr/holuspokus/homebridge-pioneer-avr-2025) ![Issues](https://img.shields.io/github/issues/holuspokus/homebridge-pioneer-avr-2025)




## Features

This plugin enables various controls for your AVR, including:

* Turn AVR On/Off
* Select active input in Home app
* Change Volume (as Lightbulb) in Home app
* Save visibility status for inputs in Home app
* Rename inputs in Home app
* Control AVR with Remote on iOS
* Remote-Key "Play/Pause" (iOS) to toggle between EXTENDED STEREO and PRO LOGIC 2 MOVIE
* Auto discover inputs


> No code changes are needed for the plugin to work properly. Just give it a try!



> When switching from the homebridge-pioneer-avr plugin to homebridge-pioneer-avr-2025, it is recommended to remove the "homebridge-pioneer-avr" plugin and the existing accessories under "Accessories" in the Homebridge settings, or reset Homebridge entirely, as well as to reboot the iOS devices.

## Installation

1. **Install Homebridge:** See the [Homebridge Installation Guide](https://github.com/homebridge/homebridge/wiki).  
2. **Add the configuration:** Use the example below or refer to `sample-config.json`, adjusting the IP address and port as needed.  
3. **Install the plugin:** Use the Homebridge UI to install **homebridge-pioneer-avr-2025**.

Alternatively:

1. **Install the Homebridge framework:**
   ```bash
   npm install -g homebridge
   ```

2. **Update your configuration file:** Use the example below or check `sample-config.json` in this repository for a sample. Create or edit the `config.json` file in the Homebridge directory (typically `~/.homebridge/`) with the appropriate configuration for your Pioneer AVR.

3. **Install **homebridge-pioneer-avr-2025**:**
   ```bash
   npm install -g homebridge-pioneer-avr-2025
   ```

4. **Start Homebridge:**
   ```bash
   homebridge
   ```





## Accessory Configuration Example

Below is a sample configuration for your accessory:

```json
"accessories": [
    {
        "accessory": "pioneerAvrAccessory",
        "model": "VSX-922",
        "name": "MyAVR",
        "description": "AV Receiver",
        "maxVolumeSet": 70,
        "host": "192.168.178.99",
        "port": 23
    }
]
```

|          Key | Value                      |
| -----------: | :------------------------- |
|    accessory | don't change               |
|        model | Custom input, can remain   |
|         name | Custom input, can remain   |
|  description | Custom input, can remain   |
| maxVolumeSet | Optional input, can remain |
| minVolumeSet | Optional input, can remain |
|         host | needs to be accurate       |
|         port | needs to be accurate       |

> **port:**  
> The port used for Telnet to connect to your receiver.  
> If port 23 does not work, try port 8102.  
> Alternatively, enable Web Interface (see user manual) and then try opening in your web browser something like:
> `http://vsx-922.local/1000/port_number.asp` or  
> `http://192.168.178.99/1000/port_number.asp`  
> ... to find the port number.

> **maxVolumeSet:**  
> A number between 0 and 100; for example, 60 means 60% of the max volume.  
> 100 = -0dB (i.e., 185 = No Limit),  
> 60 = -16dB,  
> 0: disables the volume as brightness feature  
> Defaults to 80 if undefined.  
> A value of 60 has worked well for me.  

> **Note:** The difference between `maxVolumeSet` and `minVolumeSet` should be at least 20.  
> Both only affects the volume as a brightness feature, not the remote.

> **minVolumeSet:**  
> A number between 0 and 100; for example, 30 means 30% of the max volume.  
> Defaults to 20 if undefined.  
> This setting is only active in combination with `maxVolumeSet`.  
> A value of 35 has worked well for me.  




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

- **v0.1.5**: Preparations for the transition of the plugin from Accessory to Platform. To ensure a smooth transition, this version should be installed before version 0.2.0.
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
