# homebridge-pioneer-avr-2025

Ready for Node 22 or lower.
This project was forked from [homebridge-pioneer-avr](https://github.com/kazcangi/homebridge-pioneer-avr).

homebridge-pioneer-avr is a plugin made for [homebridge](https://github.com/nfarina/homebridge),
which declare your Pioneer AVR as a TV in homekit.

The updates to the Homebridge Plugin include enhanced performance and responsiveness, a maintained single Telnet session for faster command execution, compatibility with the latest Homebridge and Node.js versions, and general improvements for better reliability, ensuring that the plugin should work directly after configuration without any manual code adjustments.

[Let me know if something goes haywire!](https://github.com/holuspokus/homebridge-pioneer-avr-2025/issues)

## Features

Declare your AVR as a homekit TV:

* Turn AVR On/Off
* Auto discover inputs
* Select active input in home app
* Select inputs to shown in the input list
* Change Volume (as Lightbulb) in home app
* Save visibility status for inputs
* Rename inputs in home apps
* Control volume through the command in control center
* Control AVR with Remote in Control Center on iOS
* Remote-Key "Play/Pause" to toggle Listening-Mode


## Installation

1. Install the homebridge framework using `npm install -g homebridge`
2. Install **homebridge-pioneer-avr-2025** using `npm i homebridge-pioneer-avr-2025`
3. Update your configuration file. See `sample-config.json` in this repository for a sample.

> When switching from the homebridge-pioneer-avr plugin to homebridge-pioneer-avr-2025, it is recommended to remove the "homebridge-pioneer-avr" plugin and the existing accessories under "Accessories" in the Homebridge settings, or reset Homebridge entirely, as well as to reboot the iOS devices.



## Accessory configuration example

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
|    accessory | dont change                |
|        model | Custom input, can remain   |
|         name | Custom input, can remain   |
|  description | Custom input, can remain   |
| maxVolumeSet | Optional input, can remain |
|         host | needs to be accurate       |
|         port | needs to be accurate       |

> **port:**  
> If port 23 does not work, try port 8102.  
>
> Or enable Web Control and then try something like:  
> http://vsx-922.local/1000/port_number.asp or  
> http://192.168.178.99/1000/port_number.asp  
> ... to find the port number  
>
>
>
> **maxVolumeSet:**  
> Number between 0 and 100; 60 means 60% of max-Volume.  
> 100 = -0db ( = 185 = No Limit),  
> 60 = -16db  
>
> 0 = disabled  
> (This only affects the Volume as Brightness-Feature)  



## Links

https://github.com/kazcangi/homebridge-pioneer-avr
https://github.com/rwifall/pioneer-receiver-notes
https://github.com/merdok/homebridge-webos-tv
https://github.com/TG908/homebridge-vsx

## Release Notes

### v0.1.0

* Some final improvements for stabilization.

### v0.0.9

* Fixed an issue related to volume control on Apple Watch. Users can now enjoy improved audio performance and seamless volume adjustments.

### v0.0.8

* Volume as Lightbulb works even finer now! 😉 Don't forget to configure it with 'maxVolumeSet': 70 or turn it off with 'maxVolumeSet': 0.

### v0.0.7

* Volume as Lightbulb works fine now

### v0.0.6

* The volume can now be adjusted within the Home icon of the receiver. However, this feature is still a bit buggy, and I’m working on it. All other functions are working fine. Turn it off with "maxVolumeSet": 0

### v0.0.5

The unused Remote-Key "Play/Pause" can now be used for toggle Listening-Mode between EXTENDED STEREO and PRO LOGIC 2 MOVIE.
Enhanced behavior when the Pioneer Receiver is not accessible over the network at plugin startup. The plugin will now attempt to establish a connection in such cases. This issue may occur due to network interruptions or power outages. While the functionality is not yet perfect, it has been significantly improved.

### v0.0.4

* Plugin-Name in Readme fixed oO

### v0.0.3

* Input 46 -> AIRPLAY added

### v0.0.2

* Fixes

### v0.0.1

* Enhanced performance and responsiveness of the Pioneer AVR receiver.
* Maintained a single Telnet session for faster command execution.
* Ensured compatibility with the latest Homebridge and Node.js versions.
* Node.js 20 LTS: No issues; Node.js 22: Deprecated warning, but fully functional.
* General improvements for better reliability.

Update recommended for optimal performance. ;)

### v0.0.0

* Forked homebridge-pioneer-avr
