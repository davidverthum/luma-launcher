package gg.luma.cosmetics.server;

import com.google.gson.JsonElement;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * What the server tells the launcher without anyone playing: small JSON files in BlueMap's web
 * folder (luma/…), served by BlueMap's own web server — the port the map already uses, so the
 * hosting needs nothing new. Before BlueMap is up the files wait in memory.
 * Test hook: -Dluma.web.dir=<folder> publishes there instead (a world without BlueMap).
 */
public final class Web {
	private static final Logger LOG = LoggerFactory.getLogger("luma-cosmetics");
	private static final Map<String, String> LAST = new LinkedHashMap<>();
	private static Path root = System.getProperty("luma.web.dir") == null ? null : Path.of(System.getProperty("luma.web.dir"));

	/** BlueMap's web root is known: everything published so far goes out. */
	static synchronized void setRoot(Path webRoot) {
		root = webRoot.resolve("luma");
		LAST.forEach(Web::write);
	}

	static synchronized void publish(String name, JsonElement json) {
		String body = json.toString();
		if (body.equals(LAST.get(name))) return;
		LAST.put(name, body);
		if (root != null) write(name, body);
	}

	private static void write(String name, String body) {
		try {
			Files.createDirectories(root);
			Path tmp = root.resolve(name + ".tmp");
			Files.writeString(tmp, body);
			Files.move(tmp, root.resolve(name), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			LOG.warn("Luma: couldn't publish {} for the launcher", name, e);
		}
	}

	private Web() {}
}
