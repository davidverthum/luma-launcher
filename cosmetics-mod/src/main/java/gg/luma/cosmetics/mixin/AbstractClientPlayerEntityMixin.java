package gg.luma.cosmetics.mixin;

import gg.luma.cosmetics.Cosmetics;
import gg.luma.cosmetics.client.LumaCosmeticsClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.util.SkinTextures;
import net.minecraft.entity.Entity;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** A Luma cape replaces whatever cape the player has; the elytra then wears it too (vanilla falls back to the cape). */
@Mixin(AbstractClientPlayerEntity.class)
abstract class AbstractClientPlayerEntityMixin {
	@Inject(method = "getSkinTextures", at = @At("RETURN"), cancellable = true)
	private void luma$cape(CallbackInfoReturnable<SkinTextures> cir) {
		Cosmetics.Choice choice = LumaCosmeticsClient.WORN.get(((Entity) (Object) this).getUuid());
		if (choice == null || choice.cape().isEmpty()) return;
		SkinTextures t = cir.getReturnValue();
		Identifier cape = Identifier.of(Cosmetics.MOD_ID, "textures/cape/" + choice.cape() + ".png");
		cir.setReturnValue(new SkinTextures(t.texture(), t.textureUrl(), cape, null, t.model(), t.secure()));
	}
}
