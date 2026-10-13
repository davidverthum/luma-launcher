package gg.luma.cosmetics;

import java.util.UUID;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;
import net.minecraft.util.Uuids;

/** Server → clients: a player's title, name color, trail and whether they're an admin (empty and
 * false: nothing, e.g. after they left). */
public record StyleSetPayload(UUID player, String title, String color, String trail, boolean admin) implements CustomPayload {
	public static final Id<StyleSetPayload> ID = new Id<>(Identifier.of(Cosmetics.MOD_ID, "style_set"));
	public static final PacketCodec<RegistryByteBuf, StyleSetPayload> CODEC = PacketCodec.tuple(
		Uuids.PACKET_CODEC, StyleSetPayload::player,
		PacketCodecs.string(32), StyleSetPayload::title,
		PacketCodecs.string(32), StyleSetPayload::color,
		PacketCodecs.string(32), StyleSetPayload::trail,
		PacketCodecs.BOOL, StyleSetPayload::admin,
		StyleSetPayload::new);

	public static StyleSetPayload of(UUID player, Cosmetics.Shown shown) {
		Cosmetics.Style s = shown.style();
		return new StyleSetPayload(player, s.title(), s.color(), s.trail(), shown.admin());
	}

	public Cosmetics.Shown shown() {
		return new Cosmetics.Shown(new Cosmetics.Style(title, color, trail).sanitized(), admin);
	}

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
