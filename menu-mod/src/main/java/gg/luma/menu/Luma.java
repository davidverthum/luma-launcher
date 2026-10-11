package gg.luma.menu;

import java.util.Map;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.client.option.ServerList;

/** What the launcher tells the game, and the launcher's palette. */
final class Luma {
	/** The pack's server when nothing else says. */
	private static final String DEFAULT_ADDRESS = "x1.qwertyx.host:28828";
	private static final String DEFAULT_NAME = "Luma";

	/** The launcher's accents (src/accent.js), night colors; the island texture comes in each. */
	private static final Map<String, Integer> ACCENTS = Map.of(
		"luma", 0xFFD4FF3D, "mint", 0xFF3DFFA8, "ice", 0xFF4FE3FF, "violet", 0xFFB39BFF,
		"pink", 0xFFFF5FAE, "lava", 0xFFFF6B3D, "amber", 0xFFFFB547);
	/** The accent the player picked in the launcher (-Dluma.accent); lime when none or unknown. */
	static final String ACCENT_ID = ACCENTS.containsKey(System.getProperty("luma.accent", "")) ? System.getProperty("luma.accent") : "luma";
	static final int ACCENT = ACCENTS.get(ACCENT_ID);
	static final int ACCENT_HOVER = mix(ACCENT, 0xFFFFFFFF, 0.3f);
	static final int ON_ACCENT = 0xFF0A0C05;
	static final int INK = 0xFFF3F5F0;
	static final int INK_2 = 0xFFA9AFA6;
	static final int INK_3 = 0xFF838A81;
	static final int SURFACE = 0xFF121519;
	static final int SURFACE_HOT = 0xFF1C2026;
	static final int LINE = 0xFF2A2F35;
	static final int OFFLINE = 0xFF6E757C;
	static final int AWAY = 0xFFFFC24D;

	private Luma() {
	}

	/** -Dluma.server from the launcher, then the «Luma» entry the launcher keeps in servers.dat,
	 * then the default — so the menu also works when the game is started some other way. */
	static ServerInfo server(MinecraftClient client) {
		String name = System.getProperty("luma.server.name", DEFAULT_NAME);
		String address = System.getProperty("luma.server");
		if (address == null || address.isBlank()) {
			address = DEFAULT_ADDRESS;
			try {
				ServerList list = new ServerList(client);
				list.loadFile();
				for (int i = 0; i < list.size(); i++) {
					ServerInfo entry = list.get(i);
					if (entry.name.equalsIgnoreCase(name)) {
						address = entry.address;
						break;
					}
				}
			} catch (RuntimeException ignored) {
				// No readable servers.dat: the default it is.
			}
		}
		return new ServerInfo(name, address, ServerInfo.ServerType.OTHER);
	}

	static int mix(int a, int b, float t) {
		int r = Math.round(((a >> 16) & 0xFF) + (((b >> 16) & 0xFF) - ((a >> 16) & 0xFF)) * t);
		int g = Math.round(((a >> 8) & 0xFF) + (((b >> 8) & 0xFF) - ((a >> 8) & 0xFF)) * t);
		int bl = Math.round((a & 0xFF) + ((b & 0xFF) - (a & 0xFF)) * t);
		return 0xFF000000 | r << 16 | g << 8 | bl;
	}

	/** The same color at `alpha` (0…1). */
	static int alpha(int color, float alpha) {
		int a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
		return a << 24 | (color & 0xFFFFFF);
	}
}
