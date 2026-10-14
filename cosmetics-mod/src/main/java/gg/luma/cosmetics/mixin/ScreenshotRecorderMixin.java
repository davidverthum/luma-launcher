package gg.luma.cosmetics.mixin;

import gg.luma.cosmetics.client.ScreenshotPlace;
import java.io.File;
import net.minecraft.client.util.ScreenshotRecorder;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** F2 picks the new screenshot's file name here — the moment to note where it was taken. */
@Mixin(ScreenshotRecorder.class)
abstract class ScreenshotRecorderMixin {
	@Inject(method = "getScreenshotFilename", at = @At("RETURN"))
	private static void luma$place(File directory, CallbackInfoReturnable<File> cir) {
		ScreenshotPlace.save(cir.getReturnValue());
	}
}
