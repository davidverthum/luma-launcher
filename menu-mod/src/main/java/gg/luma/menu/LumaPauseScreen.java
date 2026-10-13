package gg.luma.menu;

import java.io.File;
import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.PlayerSkinDrawer;
import net.minecraft.client.gui.screen.MessageScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.advancement.AdvancementsScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.gui.screen.StatsScreen;
import net.minecraft.client.network.ClientPlayNetworkHandler;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.text.Text;
import net.minecraft.util.Language;
import net.minecraft.util.Util;

/**
 * Luma's pause menu: the world blurred behind a dark column with «Вернуться в игру», settings,
 * mods, advancements, statistics, screenshots, the server map and leaving; who's on the server
 * on the right. Replaces vanilla's (MinecraftClientMixin), not the F3+Esc pause without a menu.
 */
public final class LumaPauseScreen extends Screen {
	private record Action(String key, Runnable run) {}

	private static final int COLUMN_W = LumaTitleScreen.COLUMN_W;
	private static final int ROW = 12;
	private static final int LIST_W = 138;

	private int left;
	private int kickerY;
	private int logoY;
	private int logoScale;
	private int statusY;
	private int panelRight;
	private int listX;

	public LumaPauseScreen() {
		super(Text.translatable("menu.game"));
	}

	@Override
	protected void init() {
		float s = Backdrop.scale();
		int[] logo = Backdrop.logoSize();
		left = Math.max(16, Math.round(width * 0.06f));
		logoScale = Math.max(1, Math.round(24 * s / logo[1]));
		int logoH = (int) Math.ceil(logo[1] * logoScale / s);
		boolean map = !Luma.MAP.isEmpty() && !client.isInSingleplayer();
		boolean modMenu = FabricLoader.getInstance().isModLoaded("modmenu");
		List<Action> grid = new ArrayList<>();
		grid.add(new Action("luma-menu.options", () -> client.setScreen(new OptionsScreen(this, client.options))));
		grid.add(new Action("luma-menu.pause.screenshots", this::openScreenshots));
		grid.add(new Action("luma-menu.pause.advancements", () -> client.setScreen(new AdvancementsScreen(client.player.networkHandler.getAdvancementHandler(), this))));
		grid.add(new Action("luma-menu.pause.stats", () -> client.setScreen(new StatsScreen(this, client.player.getStatHandler()))));
		if (map) grid.add(new Action("luma-menu.pause.map", () -> Util.getOperatingSystem().open(URI.create(Luma.MAP))));
		if (modMenu) grid.add(new Action("luma-menu.mods", () -> Luma.openMods(client, this)));
		int pairs = (grid.size() + 1) / 2;

		int block = 9 + 8 + logoH + 8 + 9 + 14 + 28 + 8 + pairs * 24 + 4 + 20;
		int y = Math.max(10, (height - block) / 2);
		kickerY = y;
		y += 9 + 8;
		logoY = y;
		y += logoH + 8;
		statusY = y;
		y += 9 + 14;

		addDrawableChild(new LumaButton(left, y, COLUMN_W, 28, Text.translatable("luma-menu.pause.back"), LumaButton.Style.PRIMARY, this::close));
		y += 28 + 8;

		int half = (COLUMN_W - 4) / 2;
		for (int i = 0; i < grid.size(); i++) {
			boolean alone = i == grid.size() - 1 && i % 2 == 0; // an odd one out takes the whole row
			addDrawableChild(new LumaButton(left + (i % 2) * (half + 4), y + (i / 2) * 24, alone ? COLUMN_W : half, 20,
				Text.translatable(grid.get(i).key()), LumaButton.Style.SECONDARY, grid.get(i).run()));
		}
		y += pairs * 24 + 4;

		Text leave = Text.translatable(client.isInSingleplayer() ? "luma-menu.pause.save_quit" : "luma-menu.pause.disconnect");
		addDrawableChild(new LumaButton(left, y, COLUMN_W, 20, leave, LumaButton.Style.DANGER, this::leave));

		panelRight = left + COLUMN_W + 24;
		listX = width - LIST_W - 16;
	}

	@Override
	public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
		// The world stays visible, blurred, with the menu's side darkened into the night.
		applyBlur(delta);
		float panel = 0.85f, rest = 0.4f;
		ctx.fill(0, 0, panelRight, height, Luma.alpha(0xFF050607, panel));
		// A soft edge from the panel down to the rest of the screen's shade, with no lighter seam between.
		for (int i = 0; i < 24; i++) {
			ctx.fill(panelRight + i, 0, panelRight + i + 1, height, Luma.alpha(0xFF050607, panel - (panel - rest) * (i + 1) / 25f));
		}
		ctx.fill(panelRight + 24, 0, width, height, Luma.alpha(0xFF050607, rest));
	}

	@Override
	public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
		super.render(ctx, mouseX, mouseY, delta);
		ServerInfo server = client.getCurrentServerEntry();
		Text where = client.isInSingleplayer() || server == null ? Text.translatable("luma-menu.pause.world") : Text.literal(server.name);
		Luma.kicker(ctx, textRenderer, Text.translatable("luma-menu.pause.kicker", where), left, kickerY);
		float s = Backdrop.scale();
		Backdrop.crisp(ctx, Backdrop.LOGO, Math.round(left * s), Math.round(logoY * s), Backdrop.logoSize(), logoScale, 1f);

		List<PlayerListEntry> players = players();
		if (client.isInSingleplayer() || players.isEmpty()) {
			ctx.drawText(textRenderer, Text.translatable("luma-menu.pause.paused"), left, statusY, Luma.INK_2, false);
		} else {
			ctx.fill(left + 1, statusY + 2, left + 5, statusY + 6, Luma.ACCENT);
			ctx.drawText(textRenderer, Text.translatable("luma-menu.pause.online", players.size()), left + 10, statusY, Luma.INK_2, false);
			if (listX > panelRight + 16) drawPlayers(ctx, players);
		}
	}

	/** Who's here, yourself first: a head and the name as the Tab list shows it (with Luma badges). */
	private void drawPlayers(DrawContext ctx, List<PlayerListEntry> players) {
		int y = kickerY;
		ctx.drawText(textRenderer, Text.translatable("luma-menu.pause.here"), listX, y, Luma.INK, false);
		y += 9 + 8;
		int fit = Math.max(1, (height - y - 16) / ROW);
		for (int i = 0; i < Math.min(fit, players.size()); i++) {
			PlayerListEntry p = players.get(i);
			if (i == fit - 1 && players.size() > fit) {
				ctx.drawText(textRenderer, Text.translatable("luma-menu.pause.more", players.size() - i), listX, y + 1, Luma.INK_3, false);
				break;
			}
			PlayerSkinDrawer.draw(ctx, p.getSkinTextures(), listX, y, 8);
			Text name = client.inGameHud.getPlayerListHud().getPlayerName(p);
			ctx.drawText(textRenderer, Language.getInstance().reorder(textRenderer.trimToWidth(name, LIST_W - 12)), listX + 12, y, Luma.INK, false);
			y += ROW;
		}
	}

	private List<PlayerListEntry> players() {
		ClientPlayNetworkHandler net = client.getNetworkHandler();
		if (net == null) return List.of();
		String me = client.getSession().getUsername();
		List<PlayerListEntry> list = new ArrayList<>(net.getPlayerList());
		list.sort(Comparator.comparing((PlayerListEntry p) -> !p.getProfile().getName().equals(me))
			.thenComparing(p -> p.getProfile().getName().toLowerCase()));
		return list;
	}

	private void openScreenshots() {
		File dir = new File(client.runDirectory, "screenshots");
		dir.mkdirs();
		Util.getOperatingSystem().open(dir);
	}

	/** Vanilla's «Disconnect» / «Save and Quit to Title», straight back to Luma's title screen. */
	private void leave() {
		boolean singleplayer = client.isInSingleplayer();
		if (client.world != null) client.world.disconnect();
		if (singleplayer) client.disconnect(new MessageScreen(Text.translatable("menu.savingLevel")));
		else client.disconnect();
		client.setScreen(new TitleScreen());
	}
}
