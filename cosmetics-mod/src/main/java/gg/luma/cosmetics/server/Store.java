package gg.luma.cosmetics.server;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import net.minecraft.server.MinecraftServer;
import net.minecraft.util.WorldSavePath;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Luma's own data next to the world (world/luma/…): it goes wherever the world goes, backups included. */
final class Store {
	private static final Logger LOG = LoggerFactory.getLogger("luma-cosmetics");

	static Path dir(MinecraftServer server) {
		return server.getSavePath(WorldSavePath.ROOT).normalize().resolve("luma");
	}

	/** The file's JSON, or null when it's missing or unreadable. */
	static JsonElement read(MinecraftServer server, String name) {
		Path file = dir(server).resolve(name);
		try {
			return Files.exists(file) ? JsonParser.parseString(Files.readString(file)) : null;
		} catch (IOException | RuntimeException e) {
			LOG.warn("Luma: {} is unreadable, starting it over", file, e);
			return null;
		}
	}

	static void write(MinecraftServer server, String name, JsonElement json) {
		try {
			Path dir = dir(server);
			Files.createDirectories(dir);
			Path tmp = dir.resolve(name + ".tmp");
			Files.writeString(tmp, json.toString());
			Files.move(tmp, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			LOG.warn("Luma: couldn't save {}", name, e);
		}
	}

	private Store() {}
}
