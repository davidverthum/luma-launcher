package gg.luma.cosmetics;

import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

/** Client → server: «my title, name color and trail». A channel of its own, so servers and clients
 * on 1.0.x — which only know capes and pets — keep working with this version. */
public record StylePayload(String title, String color, String trail) implements CustomPayload {
	public static final Id<StylePayload> ID = new Id<>(Identifier.of(Cosmetics.MOD_ID, "style"));
	public static final PacketCodec<RegistryByteBuf, StylePayload> CODEC = PacketCodec.tuple(
		PacketCodecs.string(32), StylePayload::title,
		PacketCodecs.string(32), StylePayload::color,
		PacketCodecs.string(32), StylePayload::trail,
		StylePayload::new);

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
