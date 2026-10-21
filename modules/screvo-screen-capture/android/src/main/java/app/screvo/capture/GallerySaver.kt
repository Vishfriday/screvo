package app.screvo.capture

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

/**
 * Puts a finished video into the device's media library, where Google Photos,
 * Gallery and every other picker will find it.
 *
 * From Android 10 an app may add its own media without asking for a storage
 * permission, so this writes through MediaStore rather than touching the
 * filesystem directly. The clip lands in Movies/Screvo.
 */
object GallerySaver {

  private const val ALBUM = "Screvo"

  fun save(context: Context, sourcePath: String, displayName: String): String {
    val source = File(sourcePath)
    if (!source.exists() || source.length() <= 0L) {
      throw IllegalStateException("There is no file to put in the gallery")
    }

    val resolver = context.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
      put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
      put(MediaStore.Video.Media.DATE_ADDED, System.currentTimeMillis() / 1000)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/$ALBUM")
        // hidden from galleries until the bytes are all there
        put(MediaStore.Video.Media.IS_PENDING, 1)
      }
    }

    val collection =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      } else {
        MediaStore.Video.Media.EXTERNAL_CONTENT_URI
      }

    val uri = resolver.insert(collection, values)
      ?: throw IllegalStateException("The gallery refused to make an entry for this video")

    try {
      resolver.openOutputStream(uri)?.use { out ->
        source.inputStream().use { input -> input.copyTo(out, 1 shl 16) }
      } ?: throw IllegalStateException("The gallery entry could not be opened for writing")
    } catch (e: Throwable) {
      resolver.delete(uri, null, null)
      throw e
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      resolver.update(uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
    }
    return uri.toString()
  }
}
