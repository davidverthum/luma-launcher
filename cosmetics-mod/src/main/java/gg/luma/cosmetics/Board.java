package gg.luma.cosmetics;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.authlib.GameProfile;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.registry.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.stat.StatHandler;
import net.minecraft.stat.Stats;
import net.minecraft.util.Identifier;
import net.minecraft.util.WorldSavePath;

/** The numbers behind the launcher's leaderboard, from Minecraft's own statistics. */
public final class Board {
	/** Travel as the statistics screen counts it, minus falling and climbing. */
	public static final List<Identifier> TRAVEL = List.of(
		Stats.WALK_ONE_CM, Stats.SPRINT_ONE_CM, Stats.CROUCH_ONE_CM, Stats.SWIM_ONE_CM, Stats.WALK_ON_WATER_ONE_CM,
		Stats.WALK_UNDER_WATER_ONE_CM, Stats.FLY_ONE_CM, Stats.AVIATE_ONE_CM, Stats.BOAT_ONE_CM, Stats.HORSE_ONE_CM,
		Stats.MINECART_ONE_CM, Stats.PIG_ONE_CM, Stats.STRIDER_ONE_CM);
	public static final List<Block> DIAMOND_ORES = List.of(Blocks.DIAMOND_ORE, Blocks.DEEPSLATE_DIAMOND_ORE);
	private static final long CACHE_MS = 60_000;

	private static List<BoardPayload.Entry> cached = List.of();
	private static long cachedAt;

	/** One player's numbers from a live stat handler — the server's for online players, the client's for yourself. */
	public static BoardPayload.Entry entry(String name, StatHandler stats) {
		long travel = 0;
		for (Identifier id : TRAVEL) travel += stats.getStat(Stats.CUSTOM.getOrCreateStat(id));
		int diamonds = 0;
		for (Block ore : DIAMOND_ORES) diamonds += stats.getStat(Stats.MINED.getOrCreateStat(ore));
		return new BoardPayload.Entry(name,
			stats.getStat(Stats.CUSTOM.getOrCreateStat(Stats.PLAY_TIME)),
			stats.getStat(Stats.CUSTOM.getOrCreateStat(Stats.DEATHS)),
			stats.getStat(Stats.CUSTOM.getOrCreateStat(Stats.MOB_KILLS)),
			travel, diamonds);
	}

	/** Everyone who ever played here, most time played first; rebuilt at most once a minute. */
	public static synchronized List<BoardPayload.Entry> get(MinecraftServer server) {
		long now = System.currentTimeMillis();
		if (now - cachedAt < CACHE_MS) return cached;
		Map<UUID, BoardPayload.Entry> all = new HashMap<>();
		readSaved(server, all);
		// Online players: fresher than the files, which are written on autosave.
		for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
			all.put(p.getUuid(), entry(p.getName().getString(), p.getStatHandler()));
		}
		cached = all.values().stream()
			.sorted(Comparator.comparingLong(BoardPayload.Entry::playTicks).reversed())
			.limit(BoardPayload.MAX)
			.toList();
		cachedAt = now;
		return cached;
	}

	/** world/stats/<uuid>.json: {"stats": {"minecraft:custom": {"minecraft:play_time": 123, …}, "minecraft:mined": {…}}}. */
	private static void readSaved(MinecraftServer server, Map<UUID, BoardPayload.Entry> into) {
		Path dir = server.getSavePath(WorldSavePath.STATS);
		if (!Files.isDirectory(dir)) return;
		try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "*.json")) {
			for (Path file : files) {
				try {
					UUID id = UUID.fromString(file.getFileName().toString().replace(".json", ""));
					Optional<String> name = name(server, id);
					if (name.isEmpty()) continue;
					JsonObject stats = JsonParser.parseString(Files.readString(file)).getAsJsonObject().getAsJsonObject("stats");
					if (stats == null) continue;
					JsonObject custom = stats.getAsJsonObject("minecraft:custom");
					JsonObject mined = stats.getAsJsonObject("minecraft:mined");
					long travel = 0;
					for (Identifier t : TRAVEL) travel += number(custom, t.toString());
					int diamonds = 0;
					for (Block ore : DIAMOND_ORES) diamonds += (int) number(mined, Registries.BLOCK.getId(ore).toString());
					into.put(id, new BoardPayload.Entry(name.get(),
						number(custom, Stats.PLAY_TIME.toString()),
						(int) number(custom, Stats.DEATHS.toString()),
						(int) number(custom, Stats.MOB_KILLS.toString()),
						travel, diamonds));
				} catch (RuntimeException | IOException e) {
					// Not a player's stats file, or a broken one: leave that player out.
				}
			}
		} catch (IOException e) {
			// No stats folder yet: an empty board.
		}
	}

	private static Optional<String> name(MinecraftServer server, UUID id) {
		return server.getUserCache() == null ? Optional.empty() : server.getUserCache().getByUuid(id).map(GameProfile::getName);
	}

	private static long number(JsonObject group, String key) {
		return group != null && group.has(key) ? group.get(key).getAsLong() : 0;
	}

	private Board() {}
}
