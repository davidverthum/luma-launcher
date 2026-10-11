package gg.luma.menu;

import com.mojang.blaze3d.systems.RenderSystem;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.multiplayer.ConnectScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.network.MultiplayerServerListPinger;
import net.minecraft.client.network.ServerAddress;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.util.ScreenshotRecorder;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.OrderedText;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.Util;

/** Luma's title screen: the launcher's island under a night sky, «Подключиться к серверу» with the
 * server's live status, and settings, mods, quit. Replaces vanilla's everywhere (MinecraftClientMixin). */
public final class LumaTitleScreen extends Screen {
	/** The launcher's island with its lamps in the player's accent. */
	private static final Identifier ISLAND = Identifier.of("luma-menu", "textures/gui/island_" + Luma.ACCENT_ID + ".png");
	private static final Identifier LOGO = Identifier.of("luma-menu", "textures/gui/logo.png");
	/** Debug: -Dluma.menu.shot=<file> saves a screenshot once the screen has settled, then quits. */
	private static final String SHOT = System.getProperty("luma.menu.shot");
	private static final long PING_TIMEOUT_MS = 8_000;
	private static final long PING_EVERY_MS = 30_000;
	private static final int COLUMN_W = 196;
	private static final int SPARKS = 36;

	private static int[] islandSize;
	private static int[] logoSize;

	private final long openedAt = Util.getMeasuringTimeMs();
	private final MultiplayerServerListPinger pinger = new MultiplayerServerListPinger();
	private final Random random = new Random(7);
	private final List<float[]> stars = new ArrayList<>(); // x, y, brightness, phase, size
	private final float[][] sparks = new float[SPARKS][]; // x, y, speed, phase, born, life
	private ServerInfo server;
	private long pingedAt;
	private boolean shotTaken;

	// Layout, from init(): GUI units, except where it says device pixels.
	private int left;
	private int kickerY;
	private int logoY;
	private int logoScale; // device pixels per logo pixel
	private int descY;
	private List<OrderedText> desc = List.of();
	private int connectY;
	private int statusY;
	private int islandX; // device pixels
	private int islandY;
	private int islandScale; // device pixels per island pixel; 0 — no room for it

	public LumaTitleScreen() {
		super(Text.translatable("luma-menu.title"));
	}

	@Override
	protected void init() {
		if (server == null) {
			server = Luma.server(client);
		}
		if (islandSize == null) {
			islandSize = size(ISLAND);
			logoSize = size(LOGO);
		}
		float s = scale();
		left = Math.max(16, Math.round(width * 0.08f));
		logoScale = Math.max(1, Math.round(36 * s / logoSize[1]));
		int logoH = (int) Math.ceil(logoSize[1] * logoScale / s);
		desc = textRenderer.wrapLines(Text.translatable("luma-menu.desc"), COLUMN_W);

		int block = 9 + 8 + logoH + 10 + desc.size() * 10 + 16 + 28 + 7 + 9 + 12 + 20;
		int y = Math.max(10, (height - block) / 2);
		kickerY = y;
		y += 9 + 8;
		logoY = y;
		y += logoH + 10;
		descY = y;
		y += desc.size() * 10 + 16;
		connectY = y;
		y += 28 + 7;
		statusY = y;
		y += 9 + 12;

		addDrawableChild(new LumaButton(left, connectY, COLUMN_W, 28, Text.translatable("luma-menu.connect"), LumaButton.Style.PRIMARY, this::connect));
		Text options = Text.translatable("luma-menu.options");
		Text mods = Text.translatable("luma-menu.mods");
		Text quit = Text.translatable("luma-menu.quit");
		boolean modMenu = FabricLoader.getInstance().isModLoaded("modmenu");
		int gap = 4;
		int quitW = textRenderer.getWidth(quit) + 24;
		int modsW = modMenu ? textRenderer.getWidth(mods) + 24 : 0;
		int optionsW = COLUMN_W - quitW - gap - (modMenu ? modsW + gap : 0);
		int x = left;
		addDrawableChild(new LumaButton(x, y, optionsW, 20, options, LumaButton.Style.SECONDARY, () -> client.setScreen(new OptionsScreen(this, client.options))));
		x += optionsW + gap;
		if (modMenu) {
			addDrawableChild(new LumaButton(x, y, modsW, 20, mods, LumaButton.Style.SECONDARY, this::openMods));
			x += modsW + gap;
		}
		addDrawableChild(new LumaButton(x, y, quitW, 20, quit, LumaButton.Style.SECONDARY, client::scheduleStop));

		// The island fills the space right of the column, in whole device pixels so it stays sharp.
		int fbW = client.getWindow().getFramebufferWidth();
		int fbH = client.getWindow().getFramebufferHeight();
		int areaX = Math.round((left + COLUMN_W + 16) * s);
		int areaW = fbW - areaX - Math.round(12 * s);
		int byHeight = Math.round(fbH * 0.56f / islandSize[1]);
		int byWidth = areaW / islandSize[0];
		islandScale = Math.max(0, Math.min(Math.max(1, byHeight), byWidth));
		islandX = areaX + (areaW - islandSize[0] * islandScale) / 2;
		islandY = (fbH - islandSize[1] * islandScale) / 2 - Math.round(6 * s);

		makeStars();
		if (pingedAt == 0 || server.getStatus() != ServerInfo.Status.SUCCESSFUL && Util.getMeasuringTimeMs() - pingedAt > PING_TIMEOUT_MS) {
			ping();
		}
	}

	@Override
	public void tick() {
		pinger.tick();
		long now = Util.getMeasuringTimeMs();
		if (now - pingedAt > PING_EVERY_MS) {
			ping();
		}
		if (SHOT != null && !shotTaken && now - openedAt > 3_000) {
			shotTaken = true;
			ScreenshotRecorder.saveScreenshot(client.runDirectory, SHOT, client.getFramebuffer(), message -> client.execute(client::scheduleStop));
		}
	}

	@Override
	public void removed() {
		pinger.cancel();
		if (server != null && server.getStatus() != ServerInfo.Status.SUCCESSFUL) {
			pingedAt = 0; // cancelled halfway: ask again when the screen is back
		}
	}

	@Override
	public boolean shouldCloseOnEsc() {
		return false;
	}

	@Override
	public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
		float t = (Util.getMeasuringTimeMs() - openedAt) / 1000f;
		ctx.fillGradient(0, 0, width, height, 0xFF0B0D11, 0xFF050607);
		for (float[] star : stars) {
			float a = star[2] * (0.6f + 0.4f * (float) Math.sin(t * 0.9f + star[3]));
			int x = (int) star[0], y = (int) star[1], size = (int) star[4];
			ctx.fill(x, y, x + size, y + size, Luma.alpha(0xFFEBF0E6, a));
		}
		if (islandScale > 0) {
			drawIsland(ctx, t);
		}
		// The primary button breathes, like «Играть» in the launcher.
		float breathe = 0.5f + 0.5f * (float) Math.sin(t * Math.PI * 2 / 3.6f);
		for (int i = 3; i >= 1; i--) {
			int grow = i * 2;
			LumaButton.stepped(ctx, left - grow, connectY - grow, COLUMN_W + grow * 2, 28 + grow * 2, Luma.alpha(Luma.ACCENT, (0.05f + 0.05f * breathe) / i));
		}
	}

	@Override
	public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
		super.render(ctx, mouseX, mouseY, delta);

		LumaButton.stepped(ctx, left, kickerY, 7, 7, Luma.ACCENT);
		ctx.fill(left + 2, kickerY + 2, left + 5, kickerY + 5, Luma.ON_ACCENT);
		ctx.drawText(textRenderer, Text.translatable("luma-menu.kicker"), left + 12, kickerY, Luma.INK_2, false);
		drawCrisp(ctx, LOGO, Math.round(left * scale()), Math.round(logoY * scale()), logoSize, logoScale, 1f);
		for (int i = 0; i < desc.size(); i++) {
			ctx.drawText(textRenderer, desc.get(i), left, descY + i * 10, Luma.INK_2, false);
		}
		drawStatus(ctx);

		ctx.drawText(textRenderer, Text.translatable("luma-menu.player", client.getSession().getUsername()), left, height - 22, Luma.INK_3, false);
		ctx.drawText(textRenderer, "Minecraft " + SharedConstants.getGameVersion().getName() + " · Fabric", left, height - 11, Luma.INK_3, false);
		Text copyright = Text.literal("Copyright Mojang AB. Do not distribute!");
		ctx.drawText(textRenderer, copyright, width - textRenderer.getWidth(copyright) - 6, height - 11, Luma.INK_3, false);

		float fade = (Util.getMeasuringTimeMs() - openedAt) / 500f;
		if (fade < 1) {
			ctx.fill(0, 0, width, height, Luma.alpha(0xFF000000, 1 - fade));
		}
	}

	private void drawIsland(DrawContext ctx, float t) {
		float s = scale();
		// Bobs a step at a time, every 1.2 s: 0, up 1, up 2, up 1 — like the launcher.
		int[] bob = {0, -1, -2, -1};
		int step = (int) (t / 1.2f) % 4;
		int dy = bob[step] * islandScale * 3; // a quarter voxel, the launcher's step
		drawCrisp(ctx, ISLAND, islandX, islandY + dy, islandSize, islandScale, 1f);

		// Sparks rise from the island, in GUI units: a soft halo around a bright pixel.
		float boxX = islandX / s, boxY = islandY / s;
		float boxW = islandSize[0] * islandScale / s, boxH = islandSize[1] * islandScale / s;
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
			float k = (float) Math.sin(Math.PI * age / p[5]);
			int x = Math.round(p[0] + (float) Math.sin(age * 1.3f + p[3]) * 1.5f);
			int y = Math.round(p[1] - p[2] * age);
			ctx.fill(x - 1, y - 1, x + 2, y + 2, Luma.alpha(Luma.ACCENT, 0.16f * k));
			ctx.fill(x, y, x + 1, y + 1, Luma.alpha(core, 0.95f * k));
		}
	}

	private void drawStatus(DrawContext ctx) {
		ServerInfo.Status status = server.getStatus();
		boolean online = status == ServerInfo.Status.SUCCESSFUL && server.players != null;
		boolean late = Util.getMeasuringTimeMs() - pingedAt > PING_TIMEOUT_MS;
		Text text;
		int dot;
		if (online) {
			text = Text.translatable("luma-menu.status.online", server.name, server.players.online(), server.players.max());
			dot = Luma.ACCENT;
		} else if (status == ServerInfo.Status.INCOMPATIBLE) {
			text = Text.translatable("luma-menu.status.incompatible", server.name);
			dot = Luma.AWAY;
		} else if (status == ServerInfo.Status.UNREACHABLE || late) {
			text = Text.translatable("luma-menu.status.offline", server.name);
			dot = Luma.OFFLINE;
		} else {
			text = Text.translatable("luma-menu.status.checking", server.name);
			dot = (Util.getMeasuringTimeMs() / 500) % 2 == 0 ? Luma.AWAY : Luma.alpha(Luma.AWAY, 0.35f);
		}
		ctx.fill(left + 1, statusY + 2, left + 5, statusY + 6, dot);
		ctx.drawText(textRenderer, text, left + 10, statusY, Luma.INK_2, false);
	}

	private void connect() {
		ConnectScreen.connect(this, client, ServerAddress.parse(server.address), server, false, null);
	}

	/** Mod Menu's list, when it's installed. */
	private void openMods() {
		try {
			Class<?> screen = Class.forName("com.terraformersmc.modmenu.gui.ModsScreen");
			client.setScreen((Screen) screen.getConstructor(Screen.class).newInstance(this));
		} catch (ReflectiveOperationException | LinkageError | ClassCastException e) {
			// A Mod Menu without that screen: the button just does nothing.
		}
	}

	private void ping() {
		pingedAt = Util.getMeasuringTimeMs();
		ServerInfo target = server;
		target.setStatus(ServerInfo.Status.PINGING);
		Util.getMainWorkerExecutor().execute(() -> {
			try {
				pinger.add(target, () -> {}, () -> target.setStatus(target.protocolVersion == SharedConstants.getGameVersion().getProtocolVersion()
					? ServerInfo.Status.SUCCESSFUL : ServerInfo.Status.INCOMPATIBLE));
			} catch (Exception e) {
				target.setStatus(ServerInfo.Status.UNREACHABLE);
			}
		});
	}

	private void makeStars() {
		stars.clear();
		Random r = new Random(11);
		int count = width * height / 420;
		for (int i = 0; i < count; i++) {
			stars.add(new float[] {r.nextInt(Math.max(1, width)), r.nextInt(Math.max(1, height * 3 / 4)), 0.25f + r.nextFloat() * 0.6f, r.nextFloat() * 6.28f, r.nextFloat() < 0.12f ? 2 : 1});
		}
	}

	private float scale() {
		return (float) client.getWindow().getScaleFactor();
	}

	/** A pixel-art texture at `x`, `y` in device pixels, each of its pixels `k` device pixels big. */
	private void drawCrisp(DrawContext ctx, Identifier texture, int x, int y, int[] size, int k, float alpha) {
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

	private static int[] size(Identifier texture) {
		try (InputStream in = MinecraftClient.getInstance().getResourceManager().open(texture); NativeImage image = NativeImage.read(in)) {
			return new int[] {image.getWidth(), image.getHeight()};
		} catch (IOException e) {
			return new int[] {1, 1};
		}
	}
}
