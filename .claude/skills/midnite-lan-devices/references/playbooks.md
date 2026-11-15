# Device playbooks

One section per `playbook` id the discovery script assigns. Each section lists:

- **Confirm**: cheap read-only probes that run before the option sheets (§2 of the skill).
- **Explore**: read-only deep-dive options to offer.
- **Control**: options that change the device or prompt on it. Confirm with the user first,
  every time.
- **Gotchas.**

The order of the checks, the forks between them and their expected durations live in
[`procedures.json`](procedures.json) (see SKILL.md §6). Keep the two in step: a check added here gets
a step there.

`$IP` is the device address. Keep every HTTP call to a 2–3 s timeout (`curl -s -m 3`).

---

## lg-webos — LG webOS TV

**Confirm**
- `nc -z -G 1 $IP 3001` checks the SSAP control port (TLS WebSocket, self-signed cert; 3000 is
  plain WebSocket and newer firmware may refuse it).
- The UPnP description is the `LOCATION` URL from the JSON, with friendlyName and modelName (e.g.
  `50UR73006LA`). The model suffix gives the year: `UR` = 2023, `UT` = 2024, `UQ` = 2022.

**Explore (read-only)**
- **Identify**: model, year, chip tier. The UR7x/UQ7x are entry-level (budget α5 processor, little
  RAM), the usual reason the UI is sluggish.
- **Network health**: `ping -c 20 -i 0.2 $IP`, reported as avg/max/jitter/loss.
- **Exposure**: open ports against the stock set (1196/1595/1647/1909 UPnP, 3000/3001 SSAP, 7000
  AirPlay, 8008/8009/8443 DIAL/cast, 18181, 36866). 🚩 22/23 open means developer mode or root.
- **Settings audit**: needs pairing (see Control). Read `ssap://settings/getSystemSettings` and
  `ssap://com.webos.service.update/getCurrentSWInformation` for firmware.

**Control (confirm first)**
- **Pairing**: an SSAP `register` over `wss://$IP:3001` with a manifest. **A prompt appears on the
  TV** and the user accepts it with the remote. It may need Settings ▸ General ▸ Devices ▸ External
  Devices ▸ *TV On With Mobile*. Store the client-key in the scratchpad only.
- Then: volume, mute, input, launch or close apps, toast notification, power off (no power-on
  over the network unless Wake-on-LAN is enabled).
- **Privacy settings** (Live Plus, ads, home promotions) aren't part of LG's public API. Community
  tools (bscpylgtv `set_settings`, webos-declutter) write them through an undocumented luna
  bridge, with key names worked out on other models. Treat any write as unverified until a
  re-read confirms it. Consents and Content Recommendation can only be changed on the TV itself.
  Offering the user the manual menu path is usually the reliable choice.

**Gotchas**
- RAM, CPU and processes can't be seen over the network without developer mode or root. Never
  estimate a saving.
- **Live Plus** is ACR: it fingerprints what's on screen on every input, HDMI included (about
  every 15 s in published tests), for ad targeting and recommendations. It's off at Settings ▸
  General ▸ System ▸ Additional Settings ▸ Live Plus.
- Ads: Additional Settings ▸ Advertisement ▸ Limit Ad Tracking. Promos: Additional Settings ▸ Home
  Settings. Consents: Support ▸ Privacy & Terms ▸ User Agreements. Wording varies a little by
  firmware.
- Quick Start+ means the TV never fully reboots. A 60 s unplug at the wall is the cheapest fix
  for slowness.

## cast — Chromecast / Google TV

- **Confirm**: `curl -s -m 3 "http://$IP:8008/setup/eureka_info?params=name,device_info,build_info"`
  (newer firmware may require 8443 with auth; report that rather than working around it).
- **Explore**: name, model, firmware, uptime, what's playing (DIAL `GET http://$IP:8008/apps/`).
- **Control (confirm)**: launch an app via DIAL `POST`, stop playback.

## roku — Roku

- **Confirm**: `curl -s -m 3 http://$IP:8060/query/device-info`. If the device has ECP set to
  "limited", say so and stop there.
- **Explore**: device info, `/query/apps`, `/query/active-app`, `/query/media-player`.
- **Control (confirm)**: `POST /keypress/<Home|Play|VolumeUp…>`, `POST /launch/<appId>`.

## samsung — Samsung Tizen TV

- **Confirm**: `curl -s -m 3 http://$IP:8001/api/v2/`, which returns model, OS and power state
  without pairing.
- **Explore**: that JSON (model, firmware, `PowerState`, developer mode flag).
- **Control (confirm)**: remote keys over `wss://$IP:8002/api/v2/channels/samsung.remote.control`.
  **This shows an allow prompt on the TV.**

## apple — Macs, iPhones, iPads, Apple TV

- **Confirm**: the mDNS TXT `model=` (e.g. `Mac16,10`, `MacBookPro18,1`), `_device-info`,
  `_companion-link`, `_airplay`. A phone or tablet often only shows in ARP (private MAC, silent
  to ping).
- **Explore**: model, the shared services it advertises (`_ssh`, `_smb`, `_rfb` screen sharing,
  `_afpovertcp`), and an open-port check of those only.
- **Control**: none. Never try a login. If the user owns the Mac and wants more, they can SSH in
  themselves.

## sonos — Sonos

- **Confirm**: `curl -s -m 3 http://$IP:1400/xml/device_description.xml`.
- **Explore**: room name, model, firmware, group topology
  (`/status/topology` on older firmware), now playing (UPnP AVTransport `GetPositionInfo` SOAP).
- **Control (confirm)**: volume or play/pause via the RenderingControl/AVTransport SOAP.

## hue — Philips Hue bridge

- **Confirm**: `curl -s -m 3 http://$IP/api/config`, which returns the name, model, software
  version and API version without auth.
- **Explore**: that config, plus `/description.xml`.
- **Control (confirm)**: listing or switching lights needs an API user. Creating one requires
  **the user to press the bridge's link button**, then a `POST /api`. Ask first.

## printer — IPP printers

- **Confirm**: `nc -z -G 1 $IP 631`.
- **Explore**: `ipptool -tv ipp://$IP/ipp/print get-printer-attributes.test`, reading
  `printer-state`, `printer-state-reasons`, `marker-names` and `marker-levels` (ink or toner %),
  and `printer-make-and-model`. The web UI is on port 80/443.
- **Control (confirm)**: none worth offering beyond a test page.

## router — Router / gateway

- **Confirm**: SSDP `InternetGatewayDevice` in the JSON means UPnP IGD is on. Check which of
  80/443 serve the admin UI (`curl -sI -m 3`).
- **Explore**:
  - **UPnP port-forward audit**: list the mappings with SOAP `GetGenericPortMappingEntry` on the
    WANIPConnection control URL, index 0.. until an error. Any mapping is something on the LAN
    opened to the internet; name the internal host from the device table.
  - **Admin exposure**: HTTP without HTTPS, and the model or firmware from headers or the title.
  - **DNS**: is the router the resolver (port 53)?
- **Control (confirm)**: deleting a port mapping (`DeletePortMapping`). Never log in to the admin
  UI unless the user supplies the credentials.

## smarthome — smart-home devices (Xiaomi, Tuya, Shelly, ESPHome, HomeKit, Matter)

- **Confirm**: the hostname (`zhimi-…` is a Xiaomi Mi device, `esp-…`/`tasmota-…` ESP firmware,
  `shelly…` Shelly), mDNS `_hap` TXT (`md=` model, `ci=` category), `_matter`.
- **Explore**: identify the vendor and product from the hostname. Shelly has
  `http://$IP/shelly` (no auth) and ESPHome a web UI on 80. Xiaomi miIO (UDP 54321) needs a device
  token, so say it's cloud-locked rather than probing.
- **Control (confirm)**: only through a documented local API the device exposes without auth, or
  with a token the user provides.

## camera — IP cameras

- **Confirm**: RTSP 554, a web UI on 80/443/8080.
- **Explore**: an exposure check only: which ports are open, whether the web UI is HTTP-only, and
  the vendor from headers. Flag 🚩 telnet/ftp.
- **Control**: none. Never try default credentials or open streams without the user's own
  credentials.

## generic — unknown devices

- **Confirm**: the script's ports plus the hostname.
- **Explore (fingerprint)**:
  - A wider connect-only probe of about 100 common ports (still no full scan).
  - `curl -sI -m 3 http://$IP/` for `Server` and title.
  - The SSH banner via `nc -w 2 $IP 22 </dev/null`.
  - The UPnP description, if any.
  - A private MAC plus silence to ping usually means a phone or laptop.
- **Control**: none until the device is identified and the user asks.

## self — the scanning Mac

Not offered as a target. Its row only anchors the table.
