package sn.telecommande.universelle;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

/** Symbole Marche/Arrêt dessiné (le caractère ⏻ manque dans la police de beaucoup de téléphones). */
final class PowerIcon extends Drawable {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF oval = new RectF();

    PowerIcon(int color, float strokePx) {
        paint.setColor(color);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(strokePx);
        paint.setStrokeCap(Paint.Cap.ROUND);
    }

    @Override
    public void draw(Canvas c) {
        Rect b = getBounds();
        float r = Math.min(b.width(), b.height()) * 0.22f;
        float cx = b.exactCenterX();
        float cy = b.exactCenterY() + r * 0.08f;
        oval.set(cx - r, cy - r, cx + r, cy + r);
        c.drawArc(oval, -58, 296, false, paint); // cercle ouvert en haut
        c.drawLine(cx, cy - r * 1.3f, cx, cy - r * 0.15f, paint);
    }

    @Override
    public void setAlpha(int alpha) {
        paint.setAlpha(alpha);
    }

    @Override
    public void setColorFilter(ColorFilter cf) {
        paint.setColorFilter(cf);
    }

    @Override
    public int getOpacity() {
        return PixelFormat.TRANSLUCENT;
    }
}
