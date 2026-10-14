package gg.luma.cosmetics.server;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import gg.luma.cosmetics.Board;
import gg.luma.cosmetics.BoardPayload;
import gg.luma.cosmetics.Cosmetics;
import gg.luma.cosmetics.ModsPayload;
import gg.luma.cosmetics.TitlesPayload;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.message.v1.ServerMessageEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Luma's server side beyond capes and pets: the chronicle, places on the map, «отошёл», earned
 * titles, the mods report and world backups — and what of it the launcher reads (Web).
 */
public final class LumaServer {
	static final Logger LOG = LoggerFactory.getLogger(Cosmetics.MOD_ID);
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path CONFIG = FabricLoader.getInstance().getConfigDir().resolve("luma-server.json");

	/** config/luma-server.json — what an admin can change. */
	static final class Config {
		int afkMinutes = 5;
		/** 0 — off: the hosting's disk is small, an admin turns this on knowingly. */
		int backupAutoHours = 0;
		int backupKeep = 3;
	}

	private static Config config = new Config();
	private static boolean blueMap;
	private static int ticks;

	static Config config() {
		return config;
	}

	static boolean blueMap() {
		return blueMap;
	}

	public static void init() {
		loadConfig();
		blueMap = FabricLoader.getInstance().isModLoaded("bluemap");
		if (blueMap) MapGlue.init();

		ServerLifecycleEvents.SERVER_STARTED.register(server -> {
			Chronicle.load(server);
			Places.load(server);
			if (blueMap) MapGlue.attach(server);
			publishOnline(server);
		});
		ServerTickEvents.END_SERVER_TICK.register(LumaServer::tick);
		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
			Chronicle.joined(handler.getPlayer());
			server.execute(() -> publishOnline(server));
		});
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			Afk.left(handler.getPlayer());
			ModReports.left(handler.getPlayer());
			server.execute(() -> publishOnline(server));
		});
		ServerPlayNetworking.registerGlobalReceiver(ModsPayload.ID, (payload, context) -> ModReports.report(context.player(), payload));
		ServerLivingEntityEvents.AFTER_DEATH.register(Chronicle::died);
		ServerMessageEvents.CHAT_MESSAGE.register((message, sender, params) -> Afk.active(sender));
		CommandRegistrationCallback.EVENT.register((dispatcher, registries, environment) -> commands(dispatcher));
	}

	private static void tick(MinecraftServer server) {
		ticks++;
		if (ticks % 20 == 0) Afk.tick(server);
		if (ticks % (20 * 30) == 0) publishOnline(server);
		if (ticks % (20 * 60) == 0) {
			Backups.autoTick(server);
			for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) sendTitles(p);
		}
		if (ticks % (20 * 60 * 5) == 20 * 30) publishBoard(server);
	}

	/** The title progress to the player's game, which keeps it for the launcher's wardrobe. */
	public static void sendTitles(ServerPlayerEntity player) {
		if (ServerPlayNetworking.canSend(player, TitlesPayload.ID)) ServerPlayNetworking.send(player, new TitlesPayload(Titles.progress(player)));
	}

	/** Who's on and who stepped away, for the launcher's «На сервере». */
	static void publishOnline(MinecraftServer server) {
		JsonObject o = new JsonObject();
		o.addProperty("updated", System.currentTimeMillis());
		JsonArray players = new JsonArray();
		for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
			JsonObject e = new JsonObject();
			e.addProperty("name", p.getName().getString());
			e.addProperty("afk", Afk.isAfk(p));
			e.addProperty("afkMin", Afk.afkMinutes(p));
			players.add(e);
		}
		o.add("players", players);
		Web.publish("online.json", o);
	}

	/** The leaderboard without anyone having to play: the launcher reads it straight from the server. */
	private static void publishBoard(MinecraftServer server) {
		JsonObject o = new JsonObject();
		o.addProperty("updated", System.currentTimeMillis());
		JsonArray rows = new JsonArray();
		for (BoardPayload.Entry e : Board.get(server)) {
			JsonObject r = new JsonObject();
			r.addProperty("name", e.name());
			r.addProperty("playTicks", e.playTicks());
			r.addProperty("deaths", e.deaths());
			r.addProperty("mobKills", e.mobKills());
			r.addProperty("distanceCm", e.distanceCm());
			r.addProperty("diamonds", e.diamonds());
			rows.add(r);
		}
		o.add("board", rows);
		Web.publish("board.json", o);
	}

	// ── commands ─────────────────────────────────────────────────────────────

	private static void commands(CommandDispatcher<ServerCommandSource> d) {
		d.register(CommandManager.literal("mark")
			.then(CommandManager.literal("add").then(CommandManager.argument("name", StringArgumentType.greedyString()).executes(c -> {
				ServerPlayerEntity p = c.getSource().getPlayerOrThrow();
				Text error = Places.add(p, StringArgumentType.getString(c, "name"));
				reply(c, error != null ? error : Text.literal("Отмечено на карте: «" + StringArgumentType.getString(c, "name").trim() + "». Видно на карте сервера и в лаунчере."), error != null);
				return error == null ? 1 : 0;
			})))
			.then(CommandManager.literal("remove").then(CommandManager.argument("name", StringArgumentType.greedyString()).executes(c -> {
				ServerPlayerEntity p = c.getSource().getPlayer();
				Text error = Places.remove(p, c.getSource().hasPermissionLevel(2), StringArgumentType.getString(c, "name"));
				reply(c, error != null ? error : Text.literal("Место убрано с карты."), error != null);
				return error == null ? 1 : 0;
			})))
			.then(CommandManager.literal("list").executes(c -> {
				List<String> lines = Places.lines();
				reply(c, Text.literal(lines.isEmpty() ? "На карте пока нет мест. Отметь своё: /mark add <название>" : "Места на карте:\n" + String.join("\n", lines)), false);
				return lines.size();
			})));

		d.register(CommandManager.literal("afk").executes(c -> {
			Afk.goAway(c.getSource().getPlayerOrThrow());
			return 1;
		}));

		d.register(CommandManager.literal("luma").requires(s -> s.hasPermissionLevel(3))
			.then(CommandManager.literal("mods").executes(c -> {
				reply(c, Text.literal(ModReports.json(c.getSource().getServer())), false);
				return 1;
			}))
			.then(CommandManager.literal("backup")
				.then(CommandManager.literal("now")
					.executes(c -> backup(c, ""))
					.then(CommandManager.argument("comment", StringArgumentType.greedyString()).executes(c -> backup(c, StringArgumentType.getString(c, "comment")))))
				.then(CommandManager.literal("list").executes(c -> {
					reply(c, Text.literal(Backups.json(c.getSource().getServer())), false);
					return 1;
				}))
				.then(CommandManager.literal("auto").then(CommandManager.argument("hours", IntegerArgumentType.integer(0, 168)).executes(c -> {
					config.backupAutoHours = IntegerArgumentType.getInteger(c, "hours");
					saveConfig();
					reply(c, Text.literal(config.backupAutoHours == 0 ? "Автобэкапы выключены." : "Автобэкап раз в " + config.backupAutoHours + " ч, если кто-то играл."), false);
					return 1;
				})))
				.then(CommandManager.literal("keep").then(CommandManager.argument("count", IntegerArgumentType.integer(1, 30)).executes(c -> {
					config.backupKeep = IntegerArgumentType.getInteger(c, "count");
					saveConfig();
					reply(c, Text.literal("Храним последних бэкапов: " + config.backupKeep + "."), false);
					return 1;
				})))));
	}

	private static int backup(CommandContext<ServerCommandSource> c, String comment) {
		String error = Backups.start(c.getSource().getServer(), comment, c.getSource().getName());
		reply(c, Text.literal(error != null ? error : "Бэкап начат. Сервер работает дальше, готовый архив появится в списке."), error != null);
		return error == null ? 1 : 0;
	}

	private static void reply(CommandContext<ServerCommandSource> c, Text text, boolean error) {
		if (error) c.getSource().sendError(text);
		else c.getSource().sendFeedback(() -> text.copy().formatted(Formatting.GRAY), false);
	}

	// ── config ──────────────────────────────────────────────────────────────

	private static void loadConfig() {
		try {
			if (Files.exists(CONFIG)) config = GSON.fromJson(Files.readString(CONFIG), Config.class);
		} catch (IOException | RuntimeException e) {
			LOG.warn("Luma: {} is unreadable, using defaults", CONFIG, e);
		}
		if (config == null) config = new Config();
		saveConfig();
	}

	private static void saveConfig() {
		try {
			Files.writeString(CONFIG, GSON.toJson(config));
		} catch (IOException e) {
			LOG.warn("Luma: couldn't save {}", CONFIG, e);
		}
	}

	private LumaServer() {}
}
