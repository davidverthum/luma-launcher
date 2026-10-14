package gg.luma.cosmetics.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import gg.luma.cosmetics.Board;
import gg.luma.cosmetics.BoardPayload;
import gg.luma.cosmetics.BoardRequestPayload;
import gg.luma.cosmetics.TitlesPayload;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.block.Block;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.network.packet.c2s.play.ClientStatusC2SPacket;
import net.minecraft.registry.Registries;
import net.minecraft.stat.StatHandler;
import net.minecraft.stat.Stats;

/**
 * The player's statistics for the launcher, in config/luma-stats.json: their own numbers (asked
 * from the server once a minute — the same request the vanilla statistics screen makes) and the
 * server's leaderboard (every five minutes, from servers with this mod). Only on a server: a
 * singleplayer world isn't the one the launcher talks about.
 */
final class StatsFile {
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("luma-stats.json");
	private static final int MINUTE = 20 * 60;
	private static final int BOARD_EVERY = MINUTE * 5;
	/** Test hook: -Dluma.stats.anyWorld=true also records singleplayer worlds. */
	private static final boolean ANY_WORLD = Boolean.getBoolean("luma.stats.anyWorld");

	private static int ticks;
	private static JsonArray board;
	private static long boardAt;
	/** Progress towards each title, from the server; kept for the wardrobe. */
	private static JsonArray titles;

	static void onTitles(TitlesPayload payload) {
		JsonArray rows = new JsonArray();
		for (TitlesPayload.Progress p : payload.titles()) {
			JsonObject o = new JsonObject();
			o.addProperty("id", p.id());
			o.addProperty("have", p.have());
			o.addProperty("need", p.need());
			rows.add(o);
		}
		titles = rows;
		// Right after joining the numbers aren't in yet (they come with the first request): the
		// scheduled write takes the titles along then, instead of zeros now.
		if (ticks > 240) write(MinecraftClient.getInstance());
	}

	static void reset() {
		ticks = 0;
	}

	static void onBoard(BoardPayload payload) {
		JsonArray rows = new JsonArray();
		for (BoardPayload.Entry e : payload.entries()) rows.add(json(e));
		board = rows;
		boardAt = System.currentTimeMillis();
		write(MinecraftClient.getInstance());
	}

	static void tick(MinecraftClient client) {
		if (client.player == null || client.getNetworkHandler() == null || !(ANY_WORLD || !client.isInSingleplayer())) return;
		ticks++;
		// Ten seconds in, then once a minute: ask, and write what came back two seconds later.
		int phase = (ticks - 200) % MINUTE;
		if (ticks < 200) return;
		if (phase == 0) client.getNetworkHandler().sendPacket(new ClientStatusC2SPacket(ClientStatusC2SPacket.Mode.REQUEST_STATS));
		if (phase == 40) write(client);
		if ((ticks - 200) % BOARD_EVERY == 0 && ClientPlayNetworking.canSend(BoardRequestPayload.ID)) {
			ClientPlayNetworking.send(BoardRequestPayload.INSTANCE);
		}
	}

	/** On leaving the server: one last write with the session's final numbers. */
	static void flush(MinecraftClient client) {
		if (ticks >= 200) write(client);
	}

	private static void write(MinecraftClient client) {
		ClientPlayerEntity player = client.player;
		// A singleplayer world's numbers aren't the server's: they'd overwrite the real ones.
		if (player == null || !(ANY_WORLD || !client.isInSingleplayer())) return;
		try {
			StatHandler stats = player.getStatHandler();
			JsonObject me = json(Board.entry(player.getName().getString(), stats));
			int mined = 0;
			for (Block block : Registries.BLOCK) mined += stats.getStat(Stats.MINED.getOrCreateStat(block));
			me.addProperty("blocksMined", mined);
			me.addProperty("jumps", stats.getStat(Stats.CUSTOM.getOrCreateStat(Stats.JUMP)));

			JsonObject root = new JsonObject();
			root.addProperty("version", 1);
			root.addProperty("updated", System.currentTimeMillis());
			ServerInfo server = client.getCurrentServerEntry();
			root.addProperty("server", server == null ? "" : server.address);
			root.add("me", me);
			JsonArray rows = board != null ? board : savedBoard();
			if (rows != null) {
				root.add("board", rows);
				root.addProperty("boardUpdated", board != null ? boardAt : savedBoardAt());
			}
			JsonArray earned = titles != null ? titles : savedArray("titles");
			if (earned != null) root.add("titles", earned);
			Path tmp = FILE.resolveSibling("luma-stats.json.tmp");
			Files.writeString(tmp, root.toString());
			Files.move(tmp, FILE, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (Exception e) {
			LumaCosmeticsClient.LOG.warn("Luma Cosmetics: couldn't save stats for the launcher", e);
		}
	}

	private static JsonObject json(BoardPayload.Entry e) {
		JsonObject o = new JsonObject();
		o.addProperty("name", e.name());
		o.addProperty("playTicks", e.playTicks());
		o.addProperty("deaths", e.deaths());
		o.addProperty("mobKills", e.mobKills());
		o.addProperty("distanceCm", e.distanceCm());
		o.addProperty("diamonds", e.diamonds());
		return o;
	}

	/** The board from an earlier session, kept until a fresh one arrives. */
	private static JsonArray savedBoard() {
		return savedArray("board");
	}

	private static JsonArray savedArray(String key) {
		JsonObject saved = saved();
		return saved != null && saved.has(key) && saved.get(key).isJsonArray() ? saved.getAsJsonArray(key) : null;
	}

	private static long savedBoardAt() {
		JsonObject saved = saved();
		JsonElement at = saved == null ? null : saved.get("boardUpdated");
		return at != null && at.isJsonPrimitive() ? at.getAsLong() : 0;
	}

	private static JsonObject saved() {
		try {
			return Files.exists(FILE) ? JsonParser.parseString(Files.readString(FILE)).getAsJsonObject() : null;
		} catch (Exception e) {
			return null;
		}
	}

	private StatsFile() {}
}
