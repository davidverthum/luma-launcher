package gg.luma.cosmetics;

import java.util.UUID;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;
import net.minecraft.util.Uuids;

/** Server → clients: what a player wears (empty strings: nothing, e.g. after they left). */
public record SetPayload(UUID player, String cape, String pet) implements CustomPayload {
	public static final Id<SetPayload> ID = new Id<>(Identifier.of(Cosmetics.MOD_ID, "set"));
	public static final PacketCodec<RegistryByteBuf, SetPayload> CODEC = PacketCodec.tuple(
		Uuids.PACKET_CODEC, SetPayload::player,
		PacketCodecs.string(32), SetPayload::cape,
		PacketCodecs.string(32), SetPayload::pet,
		SetPayload::new);

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
