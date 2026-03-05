using UnityEngine;
using UnityEditor;

public class FixPrefabScripts : MonoBehaviour
{
    [MenuItem("Tools/Fix Prefab Scripts")]
    public static void FixPrefabScriptReferences()
    {
        string[] prefabPaths = {
            "Assets/Prefabs/Red.prefab",
            "Assets/Prefabs/Blue.prefab",
            "Assets/Prefabs/Green.prefab",
            "Assets/Prefabs/Yellow.prefab",
            "Assets/Prefabs/Purple.prefab",
            "Assets/StripedCandy_Red.prefab",
            "Assets/StripedCandy_Blue.prefab",
            "Assets/StripedCandy_Green.prefab",
            "Assets/StripedCandy_Yellow.prefab",
            "Assets/StripedCandy_Purple.prefab"
        };
        
        foreach (string path in prefabPaths)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab != null)
            {
                // Candy component'ini kontrol et
                Candy candy = prefab.GetComponent<Candy>();
                if (candy == null)
                {
                    candy = prefab.AddComponent<Candy>();
                    EditorUtility.SetDirty(prefab);
                    Debug.Log($"Added Candy component to {path}");
                }
                
                // SpriteRenderer'ı kontrol et
                SpriteRenderer renderer = prefab.GetComponent<SpriteRenderer>();
                if (renderer == null)
                {
                    renderer = prefab.AddComponent<SpriteRenderer>();
                    EditorUtility.SetDirty(prefab);
                    Debug.Log($"Added SpriteRenderer to {path}");
                }
                
                PrefabUtility.SaveAsPrefabAsset(prefab, path);
                Debug.Log($"Fixed prefab: {path}");
            }
        }
        
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("All prefabs fixed!");
    }
}
