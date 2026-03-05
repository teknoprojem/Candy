using UnityEditor;
using UnityEngine;

public static class Match3PrefabSetup
{
    private const string PrefabsFolder = "Assets/Prefabs";

    [MenuItem("Tools/Match-3/Setup Candy Prefabs")]
    public static void SetupCandyPrefabs()
    {
        string[] prefabGuids = AssetDatabase.FindAssets("t:Prefab", new[] { PrefabsFolder });

        if (prefabGuids == null || prefabGuids.Length == 0)
        {
            EditorUtility.DisplayDialog(
                "Match-3 Setup",
                "No prefabs were found under 'Assets/Prefabs'.\n\nPlease make sure your candy prefabs are inside that folder, then run this again.",
                "OK");
            return;
        }

        int changedCount = 0;

        try
        {
            for (int i = 0; i < prefabGuids.Length; i++)
            {
                string path = AssetDatabase.GUIDToAssetPath(prefabGuids[i]);
                GameObject root = PrefabUtility.LoadPrefabContents(path);

                bool changed = false;

                if (root.GetComponent<Candy>() == null)
                {
                    root.AddComponent<Candy>();
                    changed = true;
                }

                BoxCollider2D collider = root.GetComponent<BoxCollider2D>();
                if (collider == null)
                {
                    collider = root.AddComponent<BoxCollider2D>();
                    changed = true;
                }

                SpriteRenderer sr = root.GetComponent<SpriteRenderer>();
                if (sr != null && sr.sprite != null)
                {
                    Vector2 size = sr.sprite.bounds.size;
                    if (collider.size != size)
                    {
                        collider.size = size;
                        collider.offset = Vector2.zero;
                        changed = true;
                    }
                }

                if (changed)
                {
                    PrefabUtility.SaveAsPrefabAsset(root, path);
                    changedCount++;
                }

                PrefabUtility.UnloadPrefabContents(root);
            }
        }
        finally
        {
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        EditorUtility.DisplayDialog(
            "Match-3 Setup",
            $"Setup complete. Updated {changedCount} prefab(s).",
            "OK");
    }
}
