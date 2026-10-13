package gg.luma.menu;

import com.mojang.blaze3d.systems.RenderSystem;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.Util;

/** Luma's night: the sky, twinkling stars and the launcher's island with sparks rising from it —
 * behind the title screen, and behind the connecting and loading screens. */
final class Backdrop {
	/** The launcher's island with its lamps in the player's accent. */
	static final Identifier ISLAND = Identifier.of("luma-menu", "textures/gui/island_" + Luma.ACCENT_ID + ".png");
	static final Identifier LOGO = Identifier.of("luma-menu", "textures/gui/logo.png");
	private static final int SPARKS = 36;

	private static int[] islandSize;
	private static int[] logoSize;

	private final long startedAt = Util.getMeasuringTimeMs();
	private final Random random = new Random(7);
	private final List<float[]> stars = new ArrayList<>(); // x, y, brightness, phase, size
	private final float[][] sparks = new float[SPARKS][]; // x, y, speed, phase, born, life
	private int starsW = -1, starsH = -1;

	static int[] islandSize() {
		if (islandSize == null) islandSize = size(ISLAND);
		return islandSize;
	}

	static int[] logoSize() {
		if (logoSize == null) logoSize = size(LOGO);
		return logoSize;
	}

	/** Seconds since this backdrop appeared. */
	float time() {
		return (Util.getMeasuringTimeMs() - startedAt) / 1000f;
	}

	/** The sky and the stars over the whole screen (GUI units). */
	void sky(DrawContext ctx, int width, int height) {
		if (width != starsW || height != starsH) makeStars(width, height);
		float t = time();
		ctx.fillGradient(0, 0, width, height, 0xFF0B0D11, 0xFF050607);
		for (float[] star : stars) {
			float a = star[2] * (0.6f + 0.4f * (float) Math.sin(t * 0.9f + star[3]));
			int x = (int) star[0], y = (int) star[1], size = (int) star[4];
			ctx.fill(x, y, x + size, y + size, Luma.alpha(0xFFEBF0E6, a));
		}
	}

	/**
	 * The island at `x`, `y` (its top-left corner, device pixels), each of its pixels `k` device
	 * pixels big, bobbing a step at a time like in the launcher, with sparks rising from it.
	 */
	void island(DrawContext ctx, int x, int y, int k) {
		if (k <= 0) return;
		int[] size = islandSize();
		float t = time();
		// Every 1.2 s: 0, up 1, up 2, up 1 — a quarter voxel each, the launcher's step.
		int[] bob = {0, -1, -2, -1};
		int dy = bob[(int) (t / 1.2f) % 4] * k * 3;
		crisp(ctx, ISLAND, x, y + dy, size, k, 1f);

		float s = scale();
		float boxX = x / s, boxY = y / s, boxW = size[0] * k / s, boxH = size[1] * k / s;
		int core = Luma.mix(Luma.ACCENT, 0xFFFFFFFF, 0.35f);
		for (int i = 0; i < SPARKS; i++) {
			float[] p = sparks[i];
			if (p == null || t - p[4] > p[5]) {
				p = sparks[i] = new float[] {
					boxX + boxW * (0.15f + random.nextFloat() * 0.7f),
					boxY + boxH * (p == null ? random.nextFloat() : 0.45f + random.nextFloat() * 0.4f),
					2f + random.nextFloat() * 4f, random.nextFloat() * 6.28f, t, 4f + random.nextFloat() * 6f,
				};
			}
			float age = t - p[4];
			float a = (float) Math.sin(Math.PI * age / p[5]);
			int sx = Math.round(p[0] + (float) Math.sin(age * 1.3f + p[3]) * 1.5f);
			int sy = Math.round(p[1] - p[2] * age);
			ctx.fill(sx - 1, sy - 1, sx + 2, sy + 2, Luma.alpha(Luma.ACCENT, 0.16f * a));
			ctx.fill(sx, sy, sx + 1, sy + 1, Luma.alpha(core, 0.95f * a));
		}
	}

	/** Device pixels per island pixel so the island is about `share` of the screen's height, but at
	 * most `maxW` device pixels wide; 0 when even one pixel per pixel doesn't fit. */
	static int islandScale(float share, int maxW) {
		int[] size = islandSize();
		int fbH = MinecraftClient.getInstance().getWindow().getFramebufferHeight();
		int byHeight = Math.max(1, Math.round(fbH * share / size[1]));
		return Math.max(0, Math.min(byHeight, maxW / size[0]));
	}

	static float scale() {
		return (float) MinecraftClient.getInstance().getWindow().getScaleFactor();
	}

	/** A pixel-art texture at `x`, `y` in device pixels, each of its pixels `k` device pixels big. */
	static void crisp(DrawContext ctx, Identifier texture, int x, int y, int[] size, int k, float alpha) {
		float s = scale();
		MatrixStack matrices = ctx.getMatrices();
		matrices.push();
		matrices.scale(1 / s, 1 / s, 1);
		RenderSystem.enableBlend();
		ctx.setShaderColor(1, 1, 1, alpha);
		ctx.drawTexture(texture, x, y, size[0] * k, size[1] * k, 0, 0, size[0], size[1], size[0], size[1]);
		ctx.setShaderColor(1, 1, 1, 1);
		RenderSystem.disableBlend();
		matrices.pop();
	}

	private void makeStars(int width, int height) {
		stars.clear();
		starsW = width;
		starsH = height;
		Random r = new Random(11);
		int count = width * height / 420;
		for (int i = 0; i < count; i++) {
			stars.add(new float[] {r.nextInt(Math.max(1, width)), r.nextInt(Math.max(1, height * 3 / 4)), 0.25f + r.nextFloat() * 0.6f, r.nextFloat() * 6.28f, r.nextFloat() < 0.12f ? 2 : 1});
		}
	}

	private static int[] size(Identifier texture) {
		try (InputStream in = MinecraftClient.getInstance().getResourceManager().open(texture); NativeImage image = NativeImage.read(in)) {
			return new int[] {image.getWidth(), image.getHeight()};
		} catch (IOException e) {
			return new int[] {1, 1};
		}
	}
}
