package gg.luma.menu;

import java.util.List;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.multiplayer.ConnectScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.network.MultiplayerServerListPinger;
import net.minecraft.client.network.ServerAddress;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.client.util.ScreenshotRecorder;
import net.minecraft.text.OrderedText;
import net.minecraft.text.Text;
import net.minecraft.util.Util;

/** Luma's title screen: the launcher's island under a night sky, «Подключиться к серверу» with the
 * server's live status, and settings, mods, quit. Replaces vanilla's everywhere (MinecraftClientMixin). */
public final class LumaTitleScreen extends Screen {
	/** Debug: -Dluma.menu.shot=<file> saves a screenshot once the screen has settled, then quits. */
	private static final String SHOT = System.getProperty("luma.menu.shot");
	private static final long PING_TIMEOUT_MS = 8_000;
	private static final long PING_EVERY_MS = 30_000;
	static final int COLUMN_W = 196;

	private final long openedAt = Util.getMeasuringTimeMs();
	private final Backdrop backdrop = new Backdrop();
	private final MultiplayerServerListPinger pinger = new MultiplayerServerListPinger();
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
		float s = Backdrop.scale();
		int[] logo = Backdrop.logoSize();
		left = Math.max(16, Math.round(width * 0.08f));
		logoScale = Math.max(1, Math.round(36 * s / logo[1]));
		int logoH = (int) Math.ceil(logo[1] * logoScale / s);
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
			addDrawableChild(new LumaButton(x, y, modsW, 20, mods, LumaButton.Style.SECONDARY, () -> Luma.openMods(client, this)));
			x += modsW + gap;
		}
		addDrawableChild(new LumaButton(x, y, quitW, 20, quit, LumaButton.Style.SECONDARY, client::scheduleStop));

		// The island fills the space right of the column, in whole device pixels so it stays sharp.
		int[] island = Backdrop.islandSize();
		int fbW = client.getWindow().getFramebufferWidth();
		int fbH = client.getWindow().getFramebufferHeight();
		int areaX = Math.round((left + COLUMN_W + 16) * s);
		int areaW = fbW - areaX - Math.round(12 * s);
		islandScale = Backdrop.islandScale(0.56f, areaW);
		islandX = areaX + (areaW - island[0] * islandScale) / 2;
		islandY = (fbH - island[1] * islandScale) / 2 - Math.round(6 * s);

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
		backdrop.sky(ctx, width, height);
		backdrop.island(ctx, islandX, islandY, islandScale);
		// The primary button breathes, like «Играть» in the launcher.
		float breathe = 0.5f + 0.5f * (float) Math.sin(backdrop.time() * Math.PI * 2 / 3.6f);
		for (int i = 3; i >= 1; i--) {
			int grow = i * 2;
			LumaButton.stepped(ctx, left - grow, connectY - grow, COLUMN_W + grow * 2, 28 + grow * 2, Luma.alpha(Luma.ACCENT, (0.05f + 0.05f * breathe) / i));
		}
	}

	@Override
	public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
		super.render(ctx, mouseX, mouseY, delta);

		Luma.kicker(ctx, textRenderer, Text.translatable("luma-menu.kicker"), left, kickerY);
		Backdrop.crisp(ctx, Backdrop.LOGO, Math.round(left * Backdrop.scale()), Math.round(logoY * Backdrop.scale()), Backdrop.logoSize(), logoScale, 1f);
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
}
