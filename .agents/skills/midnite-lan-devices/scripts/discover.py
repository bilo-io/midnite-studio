#!/usr/bin/env python3
"""Discover devices on the local network (macOS, stdlib only, Python 3.9+).

Read-only and light: one ping per address on the local /24, the ARP table, one SSDP
search, an mDNS browse, and TCP connects to a short list of well-known ports on the
hosts that answered. Nothing is sent outside the local subnet.

  python3 -I discover.py                 # markdown sitrep tables
  python3 -I discover.py --format json   # full detail for a deep dive
  python3 -I discover.py --no-ports      # skip the port probe
"""
import argparse
import concurrent.futures as cf
import ipaddress
import json
import re
import socket
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

PORTS = {
    21: "ftp", 22: "ssh", 23: "telnet", 53: "dns", 80: "http", 443: "https", 445: "smb",
    548: "afp", 554: "rtsp", 631: "ipp", 1400: "sonos", 1883: "mqtt", 3000: "webos-ws",
    3001: "webos-wss", 5000: "http-alt", 5001: "https-alt", 7000: "airplay", 8001: "samsung-ws",
    8002: "samsung-wss", 8008: "cast-http", 8009: "cast", 8060: "roku-ecp", 8080: "http-alt",
    8123: "home-assistant", 8443: "https-alt", 9100: "jetdirect", 32400: "plex", 62078: "apple-lockdown",
}

# (match on the joined signal text, kind, emoji, capabilities, playbook id). First match wins.
RULES = [
    (r"webos-second-screen|webostv|lge webos", "LG webOS TV", "📺",
     ["identify (model, firmware)", "remote control: volume, input, apps, power off",
      "settings audit (Live Plus, ads)", "cast media (DLNA, DIAL)"], "lg-webos"),
    (r"_googlecast", "Chromecast / Google TV", "📺",
     ["device info (eureka_info)", "what's playing", "launch app (DIAL)"], "cast"),
    (r"roku|roku-ecp", "Roku", "📺", ["device info", "installed apps", "remote keys"], "roku"),
    (r"samsung.*tv|samsung-ws", "Samsung TV", "📺", ["device info", "remote control (pairing)"], "samsung"),
    (r"appletv|_companion-link.*model=appletv", "Apple TV", "📺", ["identify", "AirPlay target"], "apple"),
    (r"zoneplayer|_sonos|\bsonos\b", "Sonos speaker", "🔊",
     ["zone/group info", "now playing", "volume"], "sonos"),
    (r"_spotify-connect", "Spotify Connect speaker", "🔊", ["identify"], "generic"),
    (r"ipbridge|_hue\.", "Philips Hue bridge", "💡",
     ["bridge config (no auth)", "list lights (link button)"], "hue"),
    (r"_ipp\.|_ipps\.|_printer|_pdl-datastream|jetdirect", "Printer", "🖨️",
     ["status and ink/toner (IPP)", "queue"], "printer"),
    (r"internetgatewaydevice|wanipconnection", "Router / gateway", "🌐",
     ["UPnP port-forward audit", "admin UI exposure", "firmware/model"], "router"),
    (r"zhimi|xiaomi|yeelight|miio|tuya|tasmota|esp-?[0-9a-f]{4}|shelly|kasa|tplink|tapo|wemo|nest|ring-|echo|alexa|google-home",
     "Smart-home device", "🏠", ["identify (hostname, vendor)", "local API if any"], "smarthome"),
    (r"_home-assistant|home-assistant", "Home Assistant", "🏠", ["version", "API (token)"], "generic"),
    (r"_esphomelib|_shelly|_hap\.|_matter", "Smart-home device", "🏠",
     ["identify (HomeKit/Matter TXT)", "local API if any"], "smarthome"),
    (r"rtsp|onvif|camera|ipcam", "Camera", "📷", ["exposure check (RTSP, web UI)"], "camera"),
    (r"synology|qnap|_smb.*_afpovertcp|nas", "NAS", "🗄️", ["shares (SMB)", "admin UI"], "generic"),
    (r"apple-lockdown|iphone|ipad", "iPhone / iPad", "📱", ["identify only"], "apple"),
    (r"model=mac|macbook|imac|mac-?mini|_companion-link", "Mac / Apple device", "💻",
     ["identify", "shared services (SSH, SMB, screen sharing)"], "apple"),
    (r"plexmediasvr|plex", "Plex server", "🎞️", ["server identity", "libraries (token)"], "generic"),
    (r"_ssh\.|_sftp-ssh|\bssh\b", "Computer / server", "💻", ["services", "OS hint"], "generic"),
]


def run(cmd, timeout=5):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def run_for(cmd, seconds):
    """Run a never-ending command (dns-sd) for `seconds` and return what it printed."""
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        try:
            out, _ = p.communicate(timeout=seconds)
        except subprocess.TimeoutExpired:
            p.kill()
            out, _ = p.communicate()
        return out or ""
    except Exception:
        return ""


def network():
    out = run(["route", "-n", "get", "default"])
    gw = re.search(r"gateway:\s*(\S+)", out)
    iface = re.search(r"interface:\s*(\S+)", out)
    iface = iface.group(1) if iface else "en0"
    ifc = run(["ifconfig", iface])
    m = re.search(r"inet (\d+\.\d+\.\d+\.\d+) netmask (0x[0-9a-f]+)", ifc)
    if not m:
        sys.exit("no IPv4 address on %s" % iface)
    ip, mask = m.group(1), int(m.group(2), 16)
    prefix = bin(mask).count("1")
    net = ipaddress.ip_network("%s/%d" % (ip, prefix), strict=False)
    note = ""
    if net.prefixlen < 24:  # never sweep more than the /24 we sit in
        net = ipaddress.ip_network("%s/24" % ip, strict=False)
        note = "subnet larger than /24; swept only %s" % net
    return {"iface": iface, "ip": ip, "gateway": gw.group(1) if gw else None,
            "subnet": str(net), "note": note}


def sweep(net):
    def ping(h):
        r = subprocess.run(["ping", "-c", "1", "-W", "400", str(h)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return str(h) if r.returncode == 0 else None
    with cf.ThreadPoolExecutor(64) as ex:
        return {h for h in ex.map(ping, ipaddress.ip_network(net).hosts()) if h}


def arp_table():
    hosts = {}
    for line in run(["arp", "-an"]).splitlines():
        m = re.search(r"\((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]+)", line)
        if m and m.group(2) != "ff:ff:ff:ff:ff:ff":
            mac = ":".join(p.zfill(2) for p in m.group(2).split(":"))
            hosts[m.group(1)] = mac
    return hosts


def ssdp(seconds=3):
    msg = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\n"
           "MX: 2\r\nST: ssdp:all\r\n\r\n").encode()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    s.settimeout(0.5)
    s.sendto(msg, ("239.255.255.250", 1900))
    found, end = {}, time.time() + seconds
    while time.time() < end:
        try:
            data, addr = s.recvfrom(8192)
        except socket.timeout:
            continue
        hdr = {}
        for l in data.decode(errors="ignore").split("\r\n"):
            if ":" in l:
                k, v = l.split(":", 1)
                hdr[k.strip().upper()] = v.strip()
        d = found.setdefault(addr[0], {"server": set(), "st": set(), "location": set()})
        for k, key in (("SERVER", "server"), ("ST", "st"), ("LOCATION", "location")):
            if hdr.get(k):
                d[key].add(hdr[k])
    s.close()
    return found


def upnp_description(url):
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            root = ET.fromstring(r.read())
    except Exception:
        return {}
    out = {}
    for el in root.iter():
        tag = el.tag.split("}")[-1]
        if tag in ("friendlyName", "manufacturer", "modelName", "modelNumber", "deviceType") \
                and el.text and tag not in out:
            out[tag] = el.text.strip()
    return out


def unescape(name):
    raw = re.sub(rb"\\(\d{3})", lambda m: bytes([int(m.group(1))]), name.encode())
    return raw.decode(errors="replace").replace("\\", "")


def mdns(seconds=4):
    types = set()
    for line in run_for(["dns-sd", "-B", "_services._dns-sd._udp", "local."], seconds).splitlines():
        f = line.split()
        if len(f) >= 7 and f[1] == "Add":
            types.add("%s.%s" % (f[-1], f[-2].split(".")[0]))

    def zone(t):
        return run_for(["dns-sd", "-Z", t, "local."], seconds)

    records = []  # (service type, instance, host, port, txt)
    with cf.ThreadPoolExecutor(16) as ex:
        tlist = sorted(types)
        for t, out in zip(tlist, ex.map(zone, tlist)):
            srv, txt = {}, {}
            for line in out.splitlines():
                m = re.match(r"^(\S.*?)\s+(SRV|TXT)\s+(.*)$", line)
                if not m or line.startswith(";"):
                    continue
                inst = re.sub(r"\._[a-z0-9-]+\._(tcp|udp)$", "", unescape(m.group(1)))
                if m.group(2) == "SRV":
                    p = m.group(3).split()
                    if len(p) < 4 or not p[2].isdigit():
                        continue
                    srv[inst] = (p[3].rstrip("."), int(p[2]))
                else:
                    txt[inst] = re.findall(r'"([^"]*)"', m.group(3))
            for inst, (host, port) in srv.items():
                records.append((t, inst, host, port, txt.get(inst, [])))

    hosts = {r[2] for r in records}

    def resolve(h):
        try:
            return h, socket.gethostbyname(h)
        except Exception:
            return h, None
    with cf.ThreadPoolExecutor(16) as ex:
        addr = dict(ex.map(resolve, hosts))
    by_ip = {}
    for t, inst, host, port, txt in records:
        ip = addr.get(host)
        if ip:
            by_ip.setdefault(ip, []).append(
                {"type": t, "name": inst, "host": host, "port": port, "txt": txt})
    return by_ip


def probe(ip, ports):
    open_ = []
    for p in ports:
        s = socket.socket()
        s.settimeout(0.4)
        try:
            if s.connect_ex((ip, p)) == 0:
                open_.append(p)
        except Exception:
            pass
        finally:
            s.close()
    return ip, open_


def rdns(ip):
    try:
        return ip, socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip, None


def classify(d):
    sig = " ".join([
        " ".join(d.get("ssdp_server", [])), " ".join(d.get("ssdp_st", [])),
        json.dumps(d.get("upnp", {})), " ".join(s["type"] + " " + " ".join(s["txt"])
                                               for s in d.get("mdns", [])),
        " ".join(PORTS.get(p, "") for p in d.get("ports", [])), d.get("hostname") or "",
        "gateway" if d.get("role") == "gateway" else "",
    ]).lower()
    hits = [r for r in RULES if re.search(r[0], sig)]
    if not hits:
        return "Unknown", "❔", ["port and service fingerprint"], "generic"
    caps = []
    for h in hits:
        caps += [c for c in h[3] if c not in caps]
    extra = [h[1] for h in hits[1:] if h[1] != hits[0][1]]
    kind = hits[0][1] + (" + " + ", ".join(dict.fromkeys(extra)) if extra else "")
    return kind, hits[0][2], caps, hits[0][4]


UUID = re.compile(r"^[0-9a-f]{8}-|^[0-9a-f]{12}@", re.I)


def display_name(d):
    if d.get("role") == "self":
        return LOCAL_NAME
    u = d.get("upnp", {})
    for s in d.get("mdns", []):
        if s["type"].startswith(("_airplay", "_googlecast", "_device-info", "_companion-link")):
            return s["name"]
    if u.get("friendlyName"):
        return u["friendlyName"]
    for s in d.get("mdns", []):
        if not UUID.search(s["name"]):
            return s["name"]
    if d.get("mdns"):
        return d["mdns"][0]["host"].replace(".local", "")
    return d.get("hostname") or "—"


def model(d):
    for s in d.get("mdns", []):
        for kv in s["txt"]:
            if kv.lower().startswith(("model=", "md=")):
                return kv.split("=", 1)[1]
    u = d.get("upnp", {})
    return u.get("modelName") or u.get("modelNumber") or ""


LOCAL_NAME = run(["scutil", "--get", "ComputerName"]).strip() or "this Mac"


def private_mac(mac):
    return bool(mac) and mac[1].lower() in "26ae"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", choices=["md", "json"], default="md")
    ap.add_argument("--no-ports", action="store_true")
    args = ap.parse_args()

    t0 = time.time()
    net = network()
    with cf.ThreadPoolExecutor(3) as ex:
        f_sweep = ex.submit(sweep, net["subnet"])
        f_ssdp = ex.submit(ssdp)
        f_mdns = ex.submit(mdns)
        alive, ssdp_found, mdns_found = f_sweep.result(), f_ssdp.result(), f_mdns.result()
    arp = arp_table()

    devices = {}
    in_net = ipaddress.ip_network(net["subnet"])
    for ip in set(alive) | set(arp) | set(ssdp_found) | set(mdns_found):
        try:
            if ipaddress.ip_address(ip) not in in_net or ip == str(in_net.broadcast_address):
                continue
        except ValueError:
            continue
        devices[ip] = {"ip": ip, "mac": arp.get(ip), "ping": ip in alive}
    devices.setdefault(net["ip"], {"ip": net["ip"], "mac": None, "ping": True})

    locs = {}
    for ip, s in ssdp_found.items():
        if ip in devices:
            devices[ip].update(ssdp_server=sorted(s["server"]), ssdp_st=sorted(s["st"]))
            for loc in s["location"]:
                locs[loc] = ip
    with cf.ThreadPoolExecutor(16) as ex:
        for loc, desc in zip(locs, ex.map(upnp_description, locs)):
            u = devices[locs[loc]].setdefault("upnp", {})
            for k, v in desc.items():
                # several UPnP roots per device: keep the most specific model string
                if k not in u or (k.startswith("model") and re.search(r"\d", v)
                                  and not re.search(r"\d", u[k])):
                    u[k] = v
    for ip, recs in mdns_found.items():
        if ip in devices:
            devices[ip]["mdns"] = recs
    with cf.ThreadPoolExecutor(32) as ex:
        for ip, name in ex.map(rdns, list(devices)):
            devices[ip]["hostname"] = name
        if not args.no_ports:
            for ip, ports in ex.map(lambda i: probe(i, list(PORTS)), list(devices)):
                devices[ip]["ports"] = ports

    for ip, d in devices.items():
        if ip == net["ip"]:
            d["role"] = "self"
        elif ip == net["gateway"]:
            d["role"] = "gateway"
        kind, emoji, caps, book = classify(d)
        if d.get("role") == "self":
            kind, emoji, caps, book = "This Mac (scanner)", "💻", ["—"], "self"
        if d.get("role") == "gateway":
            kind, emoji, book = "Router / gateway", "🌐", "router"
            caps = ["UPnP port-forward audit", "admin UI exposure", "firmware/model"]
        d.update(kind=kind, emoji=emoji, capabilities=caps, playbook=book,
                 name=display_name(d), model=model(d),
                 private_mac=private_mac(d.get("mac")) and d.get("role") != "gateway")
        flags = []
        if 23 in d.get("ports", []):
            flags.append("🚩 telnet open")
        if 21 in d.get("ports", []):
            flags.append("🚩 ftp open")
        d["flags"] = flags

    order = sorted(devices.values(), key=lambda d: tuple(int(x) for x in d["ip"].split(".")))
    result = {"network": net, "seconds": round(time.time() - t0, 1), "devices": order}

    if args.format == "json":
        print(json.dumps(result, indent=1, default=list))
        return

    def evidence(d):
        e = []
        if d.get("ssdp_st"):
            e.append("SSDP")
        if d.get("mdns"):
            e.append("mDNS×%d" % len(d["mdns"]))
        if d.get("ports"):
            e.append("🔌 " + ",".join(str(p) for p in d["ports"][:6]) +
                     ("…" if len(d["ports"]) > 6 else ""))
        return " · ".join(e) or "ARP only"

    def known(d):
        score = sum([bool(d.get("mac")), bool(d.get("ssdp_st")), bool(d.get("mdns")),
                     bool(d.get("ports")), bool(d.get("model")), d["kind"] != "Unknown"])
        pct = round(score / 6 * 10)
        return "✅ 100%" if pct == 10 else "`%s%s` %d%%" % ("█" * pct, "░" * (10 - pct), pct * 10)

    print("#### 📡 LAN devices · %s · %s · %s s\n" % (
        time.strftime("%Y-%m-%d %H:%M"), net["subnet"], result["seconds"]))
    print("| # | Device | IP | Kind | Identified | Evidence | Status | Notes |")
    print("|---|---|---|---|---|---|---|---|")
    for i, d in enumerate(order, 1):
        role = {"self": " (this Mac)", "gateway": " (gateway)"}.get(d.get("role"), "")
        name = (d["name"] + role).replace("|", "/")
        status = "🟢 online" if d["ping"] else "🟡 silent to ping"
        note = " · ".join(d["flags"] + ([d["model"]] if d["model"] else []) +
                          (["private MAC"] if d["private_mac"] else [])) or "—"
        print("| %d | %s %s | `%s` | %s | %s | %s | %s | %s |" % (
            i, d["emoji"], name, d["ip"], d["kind"], known(d), evidence(d), status, note[:48]))
    ident = sum(d["kind"] != "Unknown" for d in order)
    pct = round(ident / max(len(order), 1) * 20)
    print("\n`%s%s` %d/%d identified · %d with services · %d flags%s" % (
        "█" * pct, "░" * (20 - pct), ident, len(order),
        sum(bool(d.get("ssdp_st") or d.get("mdns")) for d in order),
        sum(len(d["flags"]) for d in order), (" · " + net["note"]) if net["note"] else ""))

    print("\n#### 🧭 What can be done\n")
    print("| # | Device | Can explore | Playbook |")
    print("|---|---|---|---|")
    for i, d in enumerate(order, 1):
        if d.get("role") == "self":
            continue
        print("| %d | %s %s | %s | `%s` |" % (i, d["emoji"], d["name"].replace("|", "/"),
                                            " · ".join(d["capabilities"]), d["playbook"]))


if __name__ == "__main__":
    main()
