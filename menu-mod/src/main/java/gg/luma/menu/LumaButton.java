package gg.luma.menu;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.narration.NarrationMessageBuilder;
import net.minecraft.client.gui.widget.PressableWidget;
import net.minecraft.text.Text;

/** The launcher's buttons in the game: pixel-stepped corners; the primary one lit in the accent
 * with a dark «play» square, the rest dark with a thin frame. */
final class LumaButton extends PressableWidget {
	enum Style { PRIMARY, SECONDARY }

	private final Style style;
	private final Runnable action;

	LumaButton(int x, int y, int width, int height, Text message, Style style, Runnable action) {
		super(x, y, width, height, message);
		this.style = style;
		this.action = action;
	}

	@Override
	public void onPress() {
		action.run();
	}

	@Override
	protected void renderWidget(DrawContext ctx, int mouseX, int mouseY, float delta) {
		TextRenderer font = MinecraftClient.getInstance().textRenderer;
		int x = getX(), y = getY(), w = getWidth(), h = getHeight();
		boolean hot = isSelected();
		int textY = y + (h - 8) / 2;
		if (style == Style.PRIMARY) {
			stepped(ctx, x, y, w, h, hot ? Luma.ACCENT_HOVER : Luma.ACCENT);
			int box = h - 8;
			stepped(ctx, x + 4, y + 4, box, box, Luma.ON_ACCENT);
			play(ctx, x + 4 + box / 2 - 2, y + 4 + box / 2 - 4, hot ? Luma.ACCENT_HOVER : Luma.ACCENT);
			ctx.drawText(font, getMessage(), x + 4 + box + 8, textY, Luma.ON_ACCENT, false);
			if (isFocused()) {
				frame(ctx, x + 2, y + 2, w - 4, h - 4, Luma.ON_ACCENT);
			}
		} else {
			stepped(ctx, x, y, w, h, hot ? Luma.ACCENT : Luma.LINE);
			stepped(ctx, x + 1, y + 1, w - 2, h - 2, hot ? Luma.SURFACE_HOT : Luma.SURFACE);
			int color = hot ? Luma.ACCENT : Luma.INK;
			ctx.drawText(font, getMessage(), x + (w - font.getWidth(getMessage())) / 2, textY, color, false);
		}
	}

	@Override
	protected void appendClickableNarrations(NarrationMessageBuilder builder) {
		appendDefaultNarrations(builder);
	}

	/** A filled rectangle with its corners stepped off by a pixel — the launcher's shape. The
	 * parts don't overlap, so a translucent color stays even. */
	static void stepped(DrawContext ctx, int x, int y, int w, int h, int color) {
		ctx.fill(x + 2, y, x + w - 2, y + h, color);
		ctx.fill(x + 1, y + 1, x + 2, y + h - 1, color);
		ctx.fill(x + w - 2, y + 1, x + w - 1, y + h - 1, color);
		ctx.fill(x, y + 2, x + 1, y + h - 2, color);
		ctx.fill(x + w - 1, y + 2, x + w, y + h - 2, color);
	}

	/** A one-pixel outline, for keyboard focus. */
	private static void frame(DrawContext ctx, int x, int y, int w, int h, int color) {
		ctx.fill(x + 1, y, x + w - 1, y + 1, color);
		ctx.fill(x + 1, y + h - 1, x + w - 1, y + h, color);
		ctx.fill(x, y + 1, x + 1, y + h - 1, color);
		ctx.fill(x + w - 1, y + 1, x + w, y + h - 1, color);
	}

	/** A 4×7 pixel «play» triangle. */
	private static void play(DrawContext ctx, int x, int y, int color) {
		for (int row = 0; row < 7; row++) {
			int len = Math.min(row, 6 - row) + 1;
			ctx.fill(x, y + row, x + len, y + row + 1, color);
		}
	}
}
