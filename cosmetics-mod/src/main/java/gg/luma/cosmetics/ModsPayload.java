package gg.luma.cosmetics;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

/**
 * Client → server: the mods this game runs, for the admin's «Проверка сборки». `own` — not one of
 * the jars the launcher installed (the player's own mod); `packKnown` false — the launcher didn't
 * say which jars are its own (an older launcher), so `own` means nothing. An honest report, not
 * anti-cheat: a modified client can say anything.
 */
public record ModsPayload(boolean packKnown, List<Mod> mods) implements CustomPayload {
	public static final Id<ModsPayload> ID = new Id<>(Identifier.of(Cosmetics.MOD_ID, "mods"));
	public static final int MAX = 400;

	public record Mod(String id, String version, boolean own) {
		public static final PacketCodec<RegistryByteBuf, Mod> CODEC = PacketCodec.tuple(
			PacketCodecs.string(64), Mod::id,
			PacketCodecs.string(64), Mod::version,
			PacketCodecs.BOOL, Mod::own,
			Mod::new);
	}

	public static final PacketCodec<RegistryByteBuf, ModsPayload> CODEC = PacketCodec.tuple(
		PacketCodecs.BOOL, ModsPayload::packKnown,
		PacketCodecs.<RegistryByteBuf, Mod, List<Mod>>collection(ArrayList::new, Mod.CODEC, MAX), ModsPayload::mods,
		ModsPayload::new);

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
