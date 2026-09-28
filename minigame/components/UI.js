const theme = {
  bg: "#101713",
  card: "#18221d",
  soft: "#223027",
  text: "#f5f1e8",
  muted: "#b8b7af",
  good: "#46c2a3",
  evil: "#c95d68",
  gold: "#d8b25c",
  border: "#324238",
  accent: "#3e6f58",
};
class UIComponent {
  constructor(ui) {
    this.ui = ui;
  }
}
function rounded(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
class Text extends UIComponent {
  draw(text, x, y, size = 14, color = theme.text, bold = false, width = 350) {
    const c = this.ui.ctx;
    c.font = (bold ? "bold " : "") + size + "px sans-serif";
    c.fillStyle = color;
    c.textBaseline = "top";
    const lines = [];
    let line = "";
    for (const char of String(text ?? "")) {
      if (char === "\n" || (line && c.measureText(line + char).width > width)) {
        lines.push(line);
        line = char === "\n" ? "" : char;
      } else line += char;
    }
    lines.push(line);
    lines.forEach((l, i) => c.fillText(l, x, y + i * (size + 7)));
    return lines.length * (size + 7);
  }
}
class Card extends UIComponent {
  draw(x, y, w, h, color = theme.card, border = theme.border, r = 18) {
    const c = this.ui.ctx;
    rounded(c, x, y, w, h, r);
    c.fillStyle = color;
    c.fill();
    if (border) {
      c.strokeStyle = border;
      c.lineWidth = 1;
      c.stroke();
    }
  }
}
class Button extends UIComponent {
  draw(id, label, x, y, w, onTap, options = {}) {
    const u = this.ui,
      h = options.height || 48,
      disabled = options.disabled || u.disabled;
    u.ctx.save();
    u.ctx.globalAlpha = disabled ? 0.42 : u.touch.pressed === id ? 0.7 : 1;
    u.card.draw(
      x,
      y,
      w,
      h,
      options.color || theme.accent,
      options.border || null,
      options.radius || 16,
    );
    u.ctx.font = "bold " + (options.size || 15) + "px sans-serif";
    const width = u.ctx.measureText(label).width;
    u.text.draw(
      label,
      x + (w - width) / 2,
      y + (h - (options.size || 15)) / 2 - 1,
      options.size || 15,
      options.textColor || theme.text,
      true,
      w - 8,
    );
    u.ctx.restore();
    u.hit(id, x, y, w, h, onTap, disabled);
  }
}
class Avatar extends UIComponent {
  draw(name, x, y, size = 58, selected = false, color = theme.text) {
    const u = this.ui,
      c = u.ctx;
    c.beginPath();
    c.arc(x + size / 2, y + size / 2, size / 2 - 1, 0, Math.PI * 2);
    c.fillStyle = theme.soft;
    c.fill();
    c.strokeStyle = selected ? theme.good : theme.border;
    c.lineWidth = selected ? 2 : 1;
    c.stroke();
    u.text.draw(
      Array.from(name || "玩家")[0],
      x + size / 2 - 10,
      y + size / 2 - 11,
      20,
      color,
      true,
      size,
    );
  }
}
class PlayerSeat extends UIComponent {
  draw(
    player,
    x,
    y,
    { selected = false, leader = false, onTap, disabled = false } = {},
  ) {
    const u = this.ui;
    u.avatar.draw(player.nickname, x + 9, y, 58, selected);
    let name = player.nickname || "空位";
    if (Array.from(name).length > 5)
      name = Array.from(name).slice(0, 4).join("") + "…";
    u.text.draw(
      name,
      x + 4,
      y + 64,
      12,
      player.me ? theme.gold : theme.muted,
      false,
      72,
    );
    u.text.draw(
      [
        player.me ? "我" : "",
        leader ? "队长" : "",
        player.host ? "房主" : "",
        player.online === false ? "离线" : "",
      ]
        .filter(Boolean)
        .join("·"),
      x,
      y + 85,
      10,
      theme.gold,
      false,
      76,
    );
    if (onTap)
      u.hit(
        "seat-" + player.playerId,
        x,
        y,
        76,
        104,
        onTap,
        disabled || u.disabled,
      );
  }
}
class MissionTrack extends UIComponent {
  draw(game, missions, y) {
    const u = this.ui;
    for (let i = 1; i <= 5; i++) {
      const m = missions.find((m) => m.missionNo === i);
      const color = m
        ? m.status === "SUCCESS"
          ? theme.good
          : theme.evil
        : theme.soft;
      u.card.draw(
        20 + (i - 1) * 72,
        y,
        62,
        32,
        color,
        i === game.missionNo ? theme.gold : null,
        12,
      );
      u.text.draw(
        "任务 " + i,
        28 + (i - 1) * 72,
        y + 8,
        11,
        m ? theme.bg : theme.muted,
        true,
        60,
      );
    }
  }
}
class TabBar extends UIComponent {
  draw(active) {
    const u = this.ui,
      y = u.height - u.bottom - 64;
    u.card.draw(0, y, 390, 64 + u.bottom, theme.card, null, 0);
    [
      ["Home", "⌂", "首页"],
      ["History", "▤", "战绩"],
      ["Me", "●", "我的"],
    ].forEach(([name, icon, label], i) => {
      const color = active === name ? theme.gold : theme.muted;
      u.text.draw(icon, 56 + i * 130, y + 8, 20, color, true, 40);
      u.text.draw(label, 51 + i * 130, y + 35, 12, color, false, 40);
      u.hit("tab-" + name, i * 130, y, 130, 64, () => u.app.go(name), false);
    });
  }
}
class Modal extends UIComponent {
  draw(modal) {
    const u = this.ui;
    u.touch.reset();
    u.clip = null;
    u.dy = 0;
    u.ctx.fillStyle = "rgba(0,0,0,.7)";
    u.ctx.fillRect(0, 0, 390, u.height);
    const height = Math.min(
      u.height - u.bottom - 90,
      Math.max(320, 170 + Math.ceil(String(modal.text).length / 23) * 20),
    );
    const y = Math.max(70, (u.height - height) / 2);
    u.card.draw(20, y, 350, height);
    u.text.draw(modal.title, 40, y + 22, 20, theme.gold, true, 310);
    u.text.draw(modal.text, 40, y + 65, 12, theme.text, false, 310);
    if (modal.cancel)
      u.button.draw(
        "modal-cancel",
        "取消",
        40,
        y + height - 68,
        145,
        () => {
          u.app.modal = null;
          u.app.invalidate();
        },
        { color: theme.soft },
      );
    u.button.draw(
      "modal-confirm",
      modal.confirmText || "知道了",
      modal.cancel ? 205 : 40,
      y + height - 68,
      modal.cancel ? 145 : 310,
      () => {
        u.app.modal = null;
        u.app.invalidate();
        modal.confirm?.();
      },
    );
  }
}
class Toast extends UIComponent {
  draw(message) {
    const u = this.ui;
    u.card.draw(25, u.height - u.bottom - 155, 340, 64, "#29392f", theme.gold);
    u.text.draw(
      message,
      40,
      u.height - u.bottom - 139,
      13,
      theme.text,
      false,
      310,
    );
  }
}
class UI {
  constructor(app, ctx, touch) {
    Object.assign(this, { app, ctx, touch, dy: 0 });
    for (const [name, C] of Object.entries({
      text: Text,
      card: Card,
      button: Button,
      avatar: Avatar,
      seat: PlayerSeat,
      track: MissionTrack,
      tab: TabBar,
      modal: Modal,
      toast: Toast,
    }))
      this[name] = new C(this);
  }
  begin(v) {
    this.height = v.designHeight;
    this.bottom = v.bottom;
    this.header = Math.max(48, v.top + 8);
    this.content = this.header + 72;
    this.dy = 0;
    this.clip = null;
    this.disabled = false;
    this.touch.reset();
    this.ctx.fillStyle = theme.bg;
    this.ctx.fillRect(0, 0, 390, this.height);
  }
  hit(id, x, y, width, height, onTap, disabled) {
    y += this.dy;
    if (this.clip) {
      const top = Math.max(y, this.clip.y),
        bottom = Math.min(y + height, this.clip.y + this.clip.height);
      height = bottom - top;
      y = top;
      if (height <= 0) return;
    }
    this.touch.add({ id, x, y, width, height, onTap, disabled });
  }
  headerText(title, sub, back) {
    this.text.draw(
      title,
      back ? 66 : 20,
      this.header,
      20,
      theme.text,
      true,
      back ? 204 : 250,
    );
    this.text.draw(sub, 20, this.header + 30, 12, theme.muted, false, 350);
    if (back)
      this.button.draw("back", "‹", 20, this.header - 5, 34, back, {
        height: 32,
        color: theme.soft,
        size: 20,
      });
  }
  scroll(scroll, y, height, contentHeight, draw) {
    scroll.setBounds(contentHeight, height);
    this.touch.scrolls.push({ x: 0, y, width: 390, height, scroll });
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, y, 390, height);
    this.ctx.clip();
    this.ctx.translate(0, y - scroll.offset);
    this.dy = y - scroll.offset;
    this.clip = { y, height };
    draw();
    this.dy = 0;
    this.clip = null;
    this.ctx.restore();
  }
  panel(title, lines, y, color = theme.gold) {
    const heights = lines.map(
      (line) =>
        Math.max(1, Math.ceil(Array.from(String(line)).length / 25)) * 20,
    );
    const height = 52 + heights.reduce((a, b) => a + b, 0);
    this.card.draw(20, y, 350, height);
    this.text.draw(title, 36, y + 16, 15, color, true, 318);
    let lineY = y + 46;
    lines.forEach((line, i) => {
      this.text.draw(line, 36, lineY, 12, theme.muted, false, 318);
      lineY += heights[i];
    });
    return height;
  }
}
module.exports = {
  UI,
  UIComponent,
  Button,
  Card,
  Avatar,
  Text,
  TabBar,
  PlayerSeat,
  MissionTrack,
  Modal,
  Toast,
  theme,
};
