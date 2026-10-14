package gg.luma.cosmetics.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.WorldSavePath;

/**
 * World backups for the admin panel: /luma backup now|list|auto|keep, over RCON. A backup saves the
 * world, stops writing to it for the moment the zip is made (like /save-off) and zips it into
 * backups/ next to the server, off the server thread. Only the newest few are kept, and it refuses
 * when the disk looks too full. Automatic backups are off until an admin turns them on: the
 * hosting's disk is small. Restoring is by hand, with the server stopped (see the admin panel).
 */
final class Backups {
	private static final DateTimeFormatter NAME = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm");
	private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "Luma backup");
		t.setDaemon(true);
		return t;
	});
	private static volatile boolean running;
	private static volatile String status = "";
	private static boolean playedSince;

	static Path dir(MinecraftServer server) {
		return server.getRunDirectory().resolve("backups").toAbsolutePath().normalize();
	}

	/** Starts a backup. Null — started; else why not. */
	static String start(MinecraftServer server, String comment, String by) {
		if (running) return "Бэкап уже идёт — подожди, пока он закончится.";
		running = true;
		playedSince = false;
		status = "идёт";
		Path world = server.getSavePath(WorldSavePath.ROOT).toAbsolutePath().normalize();
		Path out = dir(server);
		String level = server.getSaveProperties().getLevelName().replaceAll("[^\\p{L}\\p{N}_-]", "_");
		WORKER.execute(() -> run(server, world, out, level, comment, by));
		return null;
	}

	private static void run(MinecraftServer server, Path world, Path out, String level, String comment, String by) {
		Map<ServerWorld, Boolean> before = new HashMap<>();
		try {
			long size = sizeOf(world);
			Files.createDirectories(out);
			long free = Files.getFileStore(out).getUsableSpace();
			if (free < size + (512L << 20)) {
				finish(server, "Не хватает места на диске: мир занимает " + mb(size) + ", свободно " + mb(free) + ". Удали старые бэкапы.", false);
				return;
			}
			server.submit(() -> {
				server.saveAll(true, true, true);
				for (ServerWorld w : server.getWorlds()) {
					before.put(w, w.savingDisabled);
					w.savingDisabled = true;
				}
			}).join();
			Path zip = out.resolve(level + "_" + LocalDateTime.now().format(NAME) + ".zip");
			Path part = zip.resolveSibling(zip.getFileName() + ".part");
			zip(world, part, "Luma backup\nby: " + by + "\ncomment: " + comment + "\n");
			Files.move(part, zip, StandardCopyOption.REPLACE_EXISTING);
			int removed = prune(out, LumaServer.config().backupKeep);
			finish(server, "Бэкап готов: " + zip.getFileName() + " (" + mb(Files.size(zip)) + ")" + (removed > 0 ? ", старых удалено: " + removed : ""), true);
		} catch (Exception e) {
			finish(server, "Бэкап не получился: " + e.getMessage(), false);
		} finally {
			server.execute(() -> before.forEach((w, was) -> w.savingDisabled = was));
		}
	}

	private static void finish(MinecraftServer server, String message, boolean ok) {
		status = message;
		running = false;
		if (ok) LumaServer.LOG.info("Luma: {}", message);
		else LumaServer.LOG.warn("Luma: {}", message);
		server.execute(() -> {
			for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
				if (server.getPlayerManager().isOperator(p.getGameProfile())) p.sendMessage(Text.literal("[Luma] " + message).formatted(ok ? Formatting.GRAY : Formatting.RED));
			}
		});
	}

	private static void zip(Path world, Path to, String note) throws IOException {
		try (OutputStream file = Files.newOutputStream(to); ZipOutputStream zip = new ZipOutputStream(file, StandardCharsets.UTF_8)) {
			// Region files are compressed already: fast beats small here.
			zip.setLevel(Deflater.BEST_SPEED);
			zip.putNextEntry(new ZipEntry("luma-backup.txt"));
			zip.write(note.getBytes(StandardCharsets.UTF_8));
			zip.closeEntry();
			try (Stream<Path> files = Files.walk(world)) {
				for (Path f : (Iterable<Path>) files.filter(Files::isRegularFile)::iterator) {
					String rel = world.relativize(f).toString().replace('\\', '/');
					if (rel.equals("session.lock")) continue;
					zip.putNextEntry(new ZipEntry("world/" + rel));
					Files.copy(f, zip);
					zip.closeEntry();
				}
			}
		}
	}

	/** Deletes all but the newest `keep`; returns how many went. */
	private static int prune(Path dir, int keep) throws IOException {
		List<Path> zips = list(dir);
		int removed = 0;
		for (int i = Math.max(1, keep); i < zips.size(); i++) {
			Files.deleteIfExists(zips.get(i));
			removed++;
		}
		return removed;
	}

	/** Backups, newest first. */
	private static List<Path> list(Path dir) throws IOException {
		if (!Files.isDirectory(dir)) return List.of();
		try (Stream<Path> s = Files.list(dir)) {
			List<Path> out = new ArrayList<>(s.filter(p -> p.getFileName().toString().endsWith(".zip")).toList());
			out.sort(Comparator.comparingLong(Backups::mtime).reversed());
			return out;
		}
	}

	/** For the admin panel, one line of JSON. */
	static String json(MinecraftServer server) {
		JsonObject o = new JsonObject();
		o.addProperty("running", running);
		o.addProperty("status", status);
		o.addProperty("auto", LumaServer.config().backupAutoHours);
		o.addProperty("keep", LumaServer.config().backupKeep);
		JsonArray arr = new JsonArray();
		try {
			Path dir = dir(server);
			if (Files.isDirectory(dir)) o.addProperty("free", Files.getFileStore(dir).getUsableSpace());
			for (Path p : list(dir)) {
				JsonObject b = new JsonObject();
				b.addProperty("name", p.getFileName().toString());
				b.addProperty("size", Files.size(p));
				b.addProperty("t", mtime(p));
				arr.add(b);
			}
		} catch (IOException e) {
			o.addProperty("error", e.getMessage());
		}
		o.add("backups", arr);
		return o.toString();
	}

	/** Once a minute: an automatic backup when one is due and someone played since the last. */
	static void autoTick(MinecraftServer server) {
		if (!server.getPlayerManager().getPlayerList().isEmpty()) playedSince = true;
		int hours = LumaServer.config().backupAutoHours;
		if (hours <= 0 || running || !playedSince) return;
		try {
			List<Path> zips = list(dir(server));
			long last = zips.isEmpty() ? 0 : mtime(zips.get(0));
			if (System.currentTimeMillis() - last >= hours * 3_600_000L) start(server, "автоматический", "auto");
		} catch (IOException e) {
			LumaServer.LOG.warn("Luma: couldn't check backups", e);
		}
	}

	private static long sizeOf(Path dir) throws IOException {
		try (Stream<Path> s = Files.walk(dir)) {
			return s.filter(Files::isRegularFile).mapToLong(p -> {
				try {
					return Files.size(p);
				} catch (IOException e) {
					return 0;
				}
			}).sum();
		}
	}

	private static long mtime(Path p) {
		try {
			return Files.getLastModifiedTime(p).toMillis();
		} catch (IOException e) {
			return 0;
		}
	}

	static String mb(long bytes) {
		return bytes >= 1L << 30 ? String.format("%.1f ГБ", bytes / (double) (1L << 30)) : (bytes >> 20) + " МБ";
	}

	private Backups() {}
}
