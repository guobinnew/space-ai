#!/usr/bin/env python3
"""
Windows helper for Computer Use — pyautogui + mss bridge.
Receives JSON via argv[1], outputs JSON to stdout.

Actions: screenshot, click, type, key, scroll, mouse_move,
         cursor_position, read_clipboard, write_clipboard
"""

import sys
import json
import io
import base64

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input"}))
        sys.exit(1)

    try:
        request = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        sys.exit(1)

    action = request.get("action", "")
    params = request.get("params", {})

    try:
        result = dispatch(action, params)
        print(json.dumps(result, default=str))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


def dispatch(action, params):
    if action == "screenshot":
        return do_screenshot(params)
    elif action == "click":
        return do_click(params)
    elif action == "type":
        return do_type(params)
    elif action == "key":
        return do_key(params)
    elif action == "scroll":
        return do_scroll(params)
    elif action == "mouse_move":
        return do_mouse_move(params)
    elif action == "cursor_position":
        return do_cursor_position(params)
    elif action == "read_clipboard":
        return do_read_clipboard(params)
    elif action == "write_clipboard":
        return do_write_clipboard(params)
    else:
        return {"error": f"Unknown action: {action}"}


def do_screenshot(params):
    import mss
    import mss.tools

    with mss.mss() as sct:
        monitor = sct.monitors[1]  # Primary monitor
        screenshot = sct.grab(monitor)

        # Convert to PIL Image then to JPEG base64
        from PIL import Image
        img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")

        # Resize if too large (max 1920 wide)
        max_width = 1920
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        return {
            "image": img_b64,
            "width": img.width,
            "height": img.height,
            "format": "jpeg",
        }


def do_click(params):
    import pyautogui

    x = int(params.get("x", 0))
    y = int(params.get("y", 0))
    button = params.get("button", "left")
    clicks = int(params.get("clicks", 1))
    interval = float(params.get("interval", 0.0))

    pyautogui.click(x=x, y=y, button=button, clicks=clicks, interval=interval)
    return {"success": True, "x": x, "y": y, "button": button, "clicks": clicks}


def do_type(params):
    import pyautogui

    text = params.get("text", "")
    if not text:
        return {"success": False, "error": "No text provided"}

    pyautogui.typewrite(text, interval=0.02) if text.isascii() else pyautogui.write(text)
    return {"success": True, "length": len(text)}


def do_key(params):
    import pyautogui

    keys = params.get("keys", "")
    if isinstance(keys, str):
        keys = keys.split("+")

    if not keys:
        return {"success": False, "error": "No keys provided"}

    # pyautogui hotkey for combinations
    if len(keys) > 1:
        pyautogui.hotkey(*keys)
    else:
        pyautogui.press(keys[0])

    return {"success": True, "keys": keys}


def do_scroll(params):
    import pyautogui

    amount = int(params.get("amount", 0))
    x = params.get("x")
    y = params.get("y")

    if x is not None and y is not None:
        pyautogui.scroll(amount, x=int(x), y=int(y))
    else:
        pyautogui.scroll(amount)

    return {"success": True, "amount": amount}


def do_mouse_move(params):
    import pyautogui

    x = int(params.get("x", 0))
    y = int(params.get("y", 0))

    pyautogui.moveTo(x=x, y=y, duration=0.1)
    return {"success": True, "x": x, "y": y}


def do_cursor_position(params):
    import pyautogui

    pos = pyautogui.position()
    return {"x": pos.x, "y": pos.y}


def do_read_clipboard(params):
    import pyperclip

    text = pyperclip.paste()
    return {"text": text}


def do_write_clipboard(params):
    import pyperclip

    text = params.get("text", "")
    pyperclip.copy(text)
    return {"success": True}


if __name__ == "__main__":
    main()
