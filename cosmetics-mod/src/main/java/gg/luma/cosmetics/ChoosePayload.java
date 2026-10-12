package gg.luma.cosmetics;

import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

/** Client → server: «this is what I wear». */
public record ChoosePayload(String cape, String pet) implements CustomPayload {
	public static final Id<ChoosePayload> ID = new Id<>(Identifier.of(Cosmetics.MOD_ID, "choose"));
	public static final PacketCodec<RegistryByteBuf, ChoosePayload> CODEC = PacketCodec.tuple(
		PacketCodecs.string(32), ChoosePayload::cape,
		PacketCodecs.string(32), ChoosePayload::pet,
		ChoosePayload::new);

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
