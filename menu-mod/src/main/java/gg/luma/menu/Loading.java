package gg.luma.menu;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

/** The backdrop of the connecting, loading and «disconnected» screens: Luma's night with the island
 * low in the middle, under vanilla's own status text. One for all of them, so the stars don't jump
 * from screen to screen. */
public final class Loading {
	private static final Backdrop BACKDROP = new Backdrop();

	/** `islandAlpha`: 1 behind a short status line, lower behind a screen with text and buttons. */
	public static void render(DrawContext ctx, int width, int height, float islandAlpha) {
		BACKDROP.sky(ctx, width, height);
		MinecraftClient client = MinecraftClient.getInstance();
		int fbW = client.getWindow().getFramebufferWidth();
		int fbH = client.getWindow().getFramebufferHeight();
		int[] island = Backdrop.islandSize();
		// Between vanilla's status line (a bit above the middle) and its Cancel button (low down).
		int k = Backdrop.islandScale(0.38f, fbW * 6 / 10);
		if (k == 0) return;
		int x = (fbW - island[0] * k) / 2;
		int y = Math.round(fbH * 0.56f) - island[1] * k / 2;
		if (islandAlpha >= 1) {
			BACKDROP.island(ctx, x, y, k);
		} else {
			Backdrop.crisp(ctx, Backdrop.ISLAND, x, y, island, k, islandAlpha);
		}
	}

	private Loading() {}
}
